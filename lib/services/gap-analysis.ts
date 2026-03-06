// lib/services/gap-analysis.ts

import { sql } from '@vercel/postgres';

export class GapAnalysisService {

  static async analyzeZone(
    tbInstanceId: string,
    phase: number,
    zoneCode: string
  ) {
    // 1. TB-Instanz & Guild laden
    const instanceResult = await sql`
      SELECT
        ti.id as instance_id, ti.guild_id, ti.status,
        td.id as definition_id, td.name as tb_name, td.short_code
      FROM tb_instances ti
      JOIN tb_definitions td ON td.id = ti.tb_definition_id
      WHERE ti.id = ${tbInstanceId}
    `;

    if (instanceResult.rows.length === 0) {
      throw new Error('TB Instance not found');
    }

    const instance = instanceResult.rows[0];
    const guildId = instance.guild_id;

    // 2. Anforderungen laden
    const requirementsResult = await sql`
      SELECT
        tr.id as requirement_id, tr.unit_base_id, tr.unit_name,
        tr.min_relic, tr.min_rarity, tr.total_needed,
        tr.is_platoon, tr.is_combat_mission, tr.platoon_position, tr.zone_name
      FROM tb_requirements tr
      WHERE tr.tb_definition_id = ${instance.definition_id}
        AND tr.phase = ${phase}
        AND tr.zone_code = ${zoneCode}
      ORDER BY tr.platoon_position ASC, tr.unit_name ASC
    `;

    if (requirementsResult.rows.length === 0) {
      return {
        tbInstanceId, tbName: instance.tb_name, phase, zoneCode,
        zoneName: zoneCode, totalSlots: 0, filledSlots: 0,
        readySlots: 0, gapSlots: 0, completionPercent: 0, units: [],
      };
    }

    const zoneName = requirementsResult.rows[0].zone_name;

    // 3. Bestehende Zuweisungen
    const assignmentsResult = await sql`
      SELECT
        ta.id as assignment_id, ta.tb_requirement_id, ta.guild_member_id,
        ta.ally_code, ta.unit_base_id, ta.status,
        ta.player_relic_at_assignment, gm.player_name
      FROM tb_assignments ta
      JOIN guild_members gm ON gm.id = ta.guild_member_id
      JOIN tb_requirements tr ON tr.id = ta.tb_requirement_id
      WHERE ta.tb_instance_id = ${tbInstanceId}
        AND tr.phase = ${phase} AND tr.zone_code = ${zoneCode}
    `;

    const assignmentsByReq: Record<string, any[]> = {};
    const allAssignedKeys = new Set<string>();

    for (const a of assignmentsResult.rows) {
      if (!assignmentsByReq[a.tb_requirement_id]) assignmentsByReq[a.tb_requirement_id] = [];
      assignmentsByReq[a.tb_requirement_id].push({
        assignmentId: a.assignment_id, allyCode: a.ally_code,
        playerName: a.player_name, memberId: a.guild_member_id,
        relicTier: a.player_relic_at_assignment, status: a.status,
      });
      allAssignedKeys.add(`${a.ally_code}:${a.unit_base_id}`);
    }

    // 4. Zuweisungs-Zählung pro Spieler
    const playerCountsResult = await sql`
      SELECT ta.ally_code, COUNT(*) as cnt
      FROM tb_assignments ta
      JOIN tb_requirements tr ON tr.id = ta.tb_requirement_id
      WHERE ta.tb_instance_id = ${tbInstanceId} AND tr.phase = ${phase}
      GROUP BY ta.ally_code
    `;

    const assignmentCounts: Record<string, number> = {};
    for (const row of playerCountsResult.rows) {
      assignmentCounts[row.ally_code] = parseInt(row.cnt);
    }

    // 5. Roster pro Unit einzeln laden (FIX: kein ANY())
    const unitBaseIds = [...new Set(
      requirementsResult.rows.map((r: any) => r.unit_base_id)
    )];

    const rosterByUnit: Record<string, any[]> = {};

    for (const unitId of unitBaseIds) {
      const rosterResult = await sql`
        SELECT
          rc.ally_code, rc.unit_base_id, rc.unit_name, rc.relic_tier,
          rc.rarity, rc.gear_level, rc.galactic_power,
          gm.player_name, gm.id as member_id
        FROM roster_cache rc
        JOIN guild_members gm
          ON gm.ally_code = rc.ally_code AND gm.guild_id = rc.guild_id
        WHERE rc.guild_id = ${guildId}
          AND rc.unit_base_id = ${unitId}
        ORDER BY rc.relic_tier DESC, rc.rarity DESC
      `;
      rosterByUnit[unitId] = rosterResult.rows;
    }

    // 6. Gap-Analyse
    let totalSlots = 0, filledSlots = 0, readySlots = 0;

    const units = requirementsResult.rows.map((req: any) => {
      const assigned = assignmentsByReq[req.requirement_id] || [];
      const rosterEntries = rosterByUnit[req.unit_base_id] || [];
      totalSlots += req.total_needed;
      filledSlots += assigned.length;

      const qualifiedPlayers: any[] = [];
      const nearMissPlayers: any[] = [];

      for (const player of rosterEntries) {
        const relicDeficit = Math.max(0, req.min_relic - player.relic_tier);
        const rarityDeficit = Math.max(0, req.min_rarity - player.rarity);
        if (assigned.some((a: any) => a.allyCode === player.ally_code)) continue;

        const isAssignedElsewhere = allAssignedKeys.has(
          `${player.ally_code}:${player.unit_base_id}`
        );
        const assignCount = assignmentCounts[player.ally_code] || 0;
        const score = relicDeficit * 100 + rarityDeficit * 50 +
          (isAssignedElsewhere ? 500 : 0) + assignCount * 10 - player.relic_tier;

        const candidate = {
          allyCode: player.ally_code, playerName: player.player_name,
          memberId: player.member_id, relicTier: player.relic_tier,
          rarity: player.rarity, relicDeficit, rarityDeficit,
          isAlreadyAssignedElsewhere: isAssignedElsewhere,
          assignmentCount: assignCount, score,
        };

        if (relicDeficit === 0 && rarityDeficit === 0) qualifiedPlayers.push(candidate);
        else if (relicDeficit <= 3) nearMissPlayers.push(candidate);
      }

      qualifiedPlayers.sort((a: any, b: any) => a.score - b.score);
      nearMissPlayers.sort((a: any, b: any) => a.score - b.score);

      const gapCount = Math.max(0, req.total_needed - assigned.length);
      let status = 'empty';
      if (gapCount === 0) status = 'complete';
      else if (qualifiedPlayers.length >= gapCount) status = 'partial';
      else if (qualifiedPlayers.length > 0) status = 'critical';

      readySlots += Math.min(assigned.length + qualifiedPlayers.length, req.total_needed);

      return {
        requirement: {
          requirementId: req.requirement_id, unitBaseId: req.unit_base_id,
          unitName: req.unit_name, minRelic: req.min_relic,
          minRarity: req.min_rarity, totalNeeded: req.total_needed,
          isPlatoon: req.is_platoon, isCombatMission: req.is_combat_mission,
          platoonPosition: req.platoon_position,
        },
        totalNeeded: req.total_needed,
        fulfilledCount: Math.min(assigned.length, req.total_needed),
        assignedCount: assigned.length, gapCount, status,
        qualifiedPlayers: qualifiedPlayers.slice(0, 10),
        nearMissPlayers: nearMissPlayers.slice(0, 5),
        assignedPlayers: assigned,
      };
    });

    return {
      tbInstanceId, tbName: instance.tb_name, phase, zoneCode, zoneName,
      totalSlots, filledSlots, readySlots,
      gapSlots: totalSlots - filledSlots,
      completionPercent: totalSlots > 0 ? Math.round((filledSlots / totalSlots) * 100) : 0,
      units,
    };
  }

  static async analyzePhase(tbInstanceId: string, phase: number) {
    const zonesResult = await sql`
      SELECT DISTINCT tr.zone_code
      FROM tb_requirements tr
      JOIN tb_instances ti ON ti.tb_definition_id = tr.tb_definition_id
      WHERE ti.id = ${tbInstanceId} AND tr.phase = ${phase}
      ORDER BY tr.zone_code
    `;

    const analyses = [];
    for (const zone of zonesResult.rows) {
      const analysis = await this.analyzeZone(tbInstanceId, phase, zone.zone_code);
      analyses.push(analysis);
    }
    return analyses;
  }

  static async assignPlayer(
    tbInstanceId: string,
    requirementId: string,
    memberId: string,
    assignedByUserId: string
  ) {
    const memberResult = await sql`
      SELECT gm.id, gm.ally_code, gm.guild_id
      FROM guild_members gm WHERE gm.id = ${memberId}
    `;
    if (memberResult.rows.length === 0) {
      return { success: false, error: 'Member not found' };
    }
    const member = memberResult.rows[0];

    const reqResult = await sql`
      SELECT tr.unit_base_id, tr.total_needed
      FROM tb_requirements tr WHERE tr.id = ${requirementId}
    `;
    if (reqResult.rows.length === 0) {
      return { success: false, error: 'Requirement not found' };
    }
    const req = reqResult.rows[0];

    const existingCount = await sql`
      SELECT COUNT(*) as cnt FROM tb_assignments
      WHERE tb_instance_id = ${tbInstanceId} AND tb_requirement_id = ${requirementId}
    `;
    if (parseInt(existingCount.rows[0].cnt) >= req.total_needed) {
      return { success: false, error: 'All slots filled' };
    }

    const rosterResult = await sql`
      SELECT relic_tier FROM roster_cache
      WHERE ally_code = ${member.ally_code}
        AND unit_base_id = ${req.unit_base_id}
        AND guild_id = ${member.guild_id}
    `;
    const relicTier = rosterResult.rows[0]?.relic_tier || 0;

    await sql`
      INSERT INTO tb_assignments (
        id, tb_instance_id, tb_requirement_id, guild_member_id,
        ally_code, unit_base_id, assigned_by, status, player_relic_at_assignment
      ) VALUES (
        gen_random_uuid(), ${tbInstanceId}, ${requirementId}, ${memberId},
        ${member.ally_code}, ${req.unit_base_id}, ${assignedByUserId},
        'assigned', ${relicTier}
      )
      ON CONFLICT (tb_instance_id, tb_requirement_id, guild_member_id)
      DO UPDATE SET status = 'assigned', player_relic_at_assignment = ${relicTier},
        assigned_by = ${assignedByUserId}, updated_at = NOW()
    `;

    return { success: true };
  }

  static async unassignPlayer(assignmentId: string) {
    await sql`DELETE FROM tb_assignments WHERE id = ${assignmentId}`;
    return { success: true };
  }
}