// lib/services/gap-analysis.ts

import { sql } from '@vercel/postgres';
import {
  ZoneRequirement,
  GapAnalysisUnit,
  PlayerCandidate,
  AssignedPlayer,
  ZoneGapSummary
} from '@/lib/types/tb';

export class GapAnalysisService {

  /**
   * Hauptfunktion: Gap-Analyse für eine bestimmte Zone in einer TB-Instanz
   */
  static async analyzeZone(
    tbInstanceId: string,
    phase: number,
    zoneCode: string
  ): Promise<ZoneGapSummary> {

    // 1. TB-Instanz & Guild laden
    const instanceResult = await sql`
      SELECT
        ti.id as instance_id,
        ti.guild_id,
        ti.status,
        td.id as definition_id,
        td.name as tb_name,
        td.short_code
      FROM tb_instances ti
      JOIN tb_definitions td ON td.id = ti.tb_definition_id
      WHERE ti.id = ${tbInstanceId}
    `;

    if (instanceResult.rows.length === 0) {
      throw new Error('TB Instance not found');
    }

    const instance = instanceResult.rows[0];
    const guildId = instance.guild_id;

    // 2. Anforderungen für diese Zone laden
    const requirementsResult = await sql`
      SELECT
        tr.id as requirement_id,
        tr.unit_base_id,
        tr.unit_name,
        tr.min_relic,
        tr.min_rarity,
        tr.total_needed,
        tr.is_platoon,
        tr.is_combat_mission,
        tr.platoon_position,
        tr.zone_name
      FROM tb_requirements tr
      WHERE tr.tb_definition_id = ${instance.definition_id}
        AND tr.phase = ${phase}
        AND tr.zone_code = ${zoneCode}
      ORDER BY tr.platoon_position ASC, tr.unit_name ASC
    `;

    const requirements: ZoneRequirement[] = requirementsResult.rows.map(r => ({
      requirementId: r.requirement_id,
      unitBaseId: r.unit_base_id,
      unitName: r.unit_name,
      minRelic: r.min_relic,
      minRarity: r.min_rarity,
      totalNeeded: r.total_needed,
      isPlatoon: r.is_platoon,
      isCombatMission: r.is_combat_mission,
      platoonPosition: r.platoon_position,
    }));

    const zoneName = requirementsResult.rows[0]?.zone_name || zoneCode;

    // 3. Bestehende Zuweisungen für diese Instanz + Phase laden
    const assignmentsResult = await sql`
      SELECT
        ta.id as assignment_id,
        ta.tb_requirement_id,
        ta.guild_member_id,
        ta.ally_code,
        ta.unit_base_id,
        ta.status,
        ta.player_relic_at_assignment,
        gm.player_name
      FROM tb_assignments ta
      JOIN guild_members gm ON gm.id = ta.guild_member_id
      JOIN tb_requirements tr ON tr.id = ta.tb_requirement_id
      WHERE ta.tb_instance_id = ${tbInstanceId}
        AND tr.phase = ${phase}
        AND tr.zone_code = ${zoneCode}
    `;

    // Map: requirement_id -> assignments
    const assignmentsByReq = new Map<string, AssignedPlayer[]>();
    const allAssignedAllyCodes = new Set<string>();

    for (const a of assignmentsResult.rows) {
      if (!assignmentsByReq.has(a.tb_requirement_id)) {
        assignmentsByReq.set(a.tb_requirement_id, []);
      }
      assignmentsByReq.get(a.tb_requirement_id)!.push({
        assignmentId: a.assignment_id,
        allyCode: a.ally_code,
        playerName: a.player_name,
        memberId: a.guild_member_id,
        relicTier: a.player_relic_at_assignment,
        status: a.status,
      });
      allAssignedAllyCodes.add(`${a.ally_code}:${a.unit_base_id}`);
    }

    // 4. Zählung der Zuweisungen pro Spieler in dieser Phase
    const playerAssignmentCounts = await sql`
      SELECT
        ta.ally_code,
        COUNT(*) as assignment_count
      FROM tb_assignments ta
      JOIN tb_requirements tr ON tr.id = ta.tb_requirement_id
      WHERE ta.tb_instance_id = ${tbInstanceId}
        AND tr.phase = ${phase}
      GROUP BY ta.ally_code
    `;

    const assignmentCountMap = new Map<string, number>();
    for (const row of playerAssignmentCounts.rows) {
      assignmentCountMap.set(row.ally_code, parseInt(row.assignment_count));
    }

    // 5. Alle benötigten Unit-IDs sammeln
    const unitBaseIds = [...new Set(requirements.map(r => r.unitBaseId))];

    // 6. Roster-Daten für alle relevanten Units laden
    const rosterResult = unitBaseIds.length > 0 ? await sql`
      SELECT
        rc.ally_code,
        rc.unit_base_id,
        rc.unit_name,
        rc.relic_tier,
        rc.rarity,
        rc.gear_level,
        rc.galactic_power,
        gm.player_name,
        gm.id as member_id
      FROM roster_cache rc
      JOIN guild_members gm ON gm.ally_code = rc.ally_code AND gm.guild_id = rc.guild_id
      WHERE rc.guild_id = ${guildId}
        AND rc.unit_base_id = ANY(${unitBaseIds})
      ORDER BY rc.relic_tier DESC, rc.rarity DESC
    ` : { rows: [] };

    // Map: unit_base_id -> PlayerUnit[]
    const rosterByUnit = new Map<string, any[]>();
    for (const r of rosterResult.rows) {
      if (!rosterByUnit.has(r.unit_base_id)) {
        rosterByUnit.set(r.unit_base_id, []);
      }
      rosterByUnit.get(r.unit_base_id)!.push(r);
    }

    // 7. Gap-Analyse pro Requirement
    let totalSlots = 0;
    let filledSlots = 0;
    let readySlots = 0;

    const units: GapAnalysisUnit[] = requirements.map(req => {
      const assigned = assignmentsByReq.get(req.requirementId) || [];
      const rosterEntries = rosterByUnit.get(req.unitBaseId) || [];

      totalSlots += req.totalNeeded;
      filledSlots += assigned.length;

      // Qualifizierte Spieler (erfüllen Anforderung)
      const qualifiedPlayers: PlayerCandidate[] = [];
      const nearMissPlayers: PlayerCandidate[] = [];

      for (const player of rosterEntries) {
        const relicDeficit = Math.max(0, req.minRelic - player.relic_tier);
        const rarityDeficit = Math.max(0, req.minRarity - player.rarity);
        const isAssignedHere = assigned.some(a => a.allyCode === player.ally_code);

        if (isAssignedHere) continue; // Bereits zugewiesen

        const isAssignedElsewhere = allAssignedAllyCodes.has(
          `${player.ally_code}:${player.unit_base_id}`
        );
        const assignCount = assignmentCountMap.get(player.ally_code) || 0;

        // Score berechnen (niedrig = besser)
        // Bevorzugt: genau erfüllt, wenige andere Zuweisungen
        const score = (relicDeficit * 100) +
                      (rarityDeficit * 50) +
                      (isAssignedElsewhere ? 500 : 0) +
                      (assignCount * 10) -
                      (player.relic_tier); // Höherer Relic = leicht besser

        const candidate: PlayerCandidate = {
          allyCode: player.ally_code,
          playerName: player.player_name,
          memberId: player.member_id,
          relicTier: player.relic_tier,
          rarity: player.rarity,
          relicDeficit,
          rarityDeficit,
          isAlreadyAssignedElsewhere: isAssignedElsewhere,
          assignmentCount: assignCount,
          score,
        };

        if (relicDeficit === 0 && rarityDeficit === 0) {
          qualifiedPlayers.push(candidate);
          readySlots++; // Zähle nur bei erstem Durchlauf...
        } else if (relicDeficit <= 3) {
          // "Near miss" = maximal 3 Relic-Stufen entfernt
          nearMissPlayers.push(candidate);
        }
      }

      // Sortieren nach Score
      qualifiedPlayers.sort((a, b) => a.score - b.score);
      nearMissPlayers.sort((a, b) => a.score - b.score);

      // Status bestimmen
      const gapCount = Math.max(0, req.totalNeeded - assigned.length);
      let status: GapAnalysisUnit['status'];
      if (gapCount === 0) {
        status = 'complete';
      } else if (qualifiedPlayers.length >= gapCount) {
        status = 'partial'; // Gap vorhanden, aber genug Kandidaten
      } else if (qualifiedPlayers.length > 0) {
        status = 'critical'; // Einige, aber nicht genug
      } else {
        status = 'empty'; // Niemand verfügbar
      }

      return {
        requirement: req,
        totalNeeded: req.totalNeeded,
        fulfilledCount: Math.min(assigned.length, req.totalNeeded),
        assignedCount: assigned.length,
        gapCount,
        status,
        qualifiedPlayers: qualifiedPlayers.slice(0, 10), // Top 10
        nearMissPlayers: nearMissPlayers.slice(0, 5),     // Top 5
        assignedPlayers: assigned,
      };
    });

    // readySlots richtig zählen (basierend auf qualifizierten, nicht zugewiesenen)
    const actualReadySlots = units.reduce(
      (sum, u) => sum + Math.min(u.assignedCount + u.qualifiedPlayers.length, u.totalNeeded),
      0
    );

    const gapSlots = totalSlots - filledSlots;
    const completionPercent = totalSlots > 0
      ? Math.round((filledSlots / totalSlots) * 100)
      : 0;

    return {
      tbInstanceId,
      tbName: instance.tb_name,
      phase,
      zoneCode,
      zoneName,
      totalSlots,
      filledSlots,
      readySlots: actualReadySlots,
      gapSlots,
      completionPercent,
      units,
    };
  }

  /**
   * Gesamtübersicht: Alle Zonen einer Phase
   */
  static async analyzePhase(
    tbInstanceId: string,
    phase: number
  ): Promise<ZoneGapSummary[]> {
    const zonesResult = await sql`
      SELECT DISTINCT tr.zone_code, tr.zone_name
      FROM tb_requirements tr
      JOIN tb_instances ti ON ti.tb_definition_id = tr.tb_definition_id
      WHERE ti.id = ${tbInstanceId}
        AND tr.phase = ${phase}
      ORDER BY tr.zone_code
    `;

    const analyses: ZoneGapSummary[] = [];
    for (const zone of zonesResult.rows) {
      const analysis = await this.analyzeZone(tbInstanceId, phase, zone.zone_code);
      analyses.push(analysis);
    }

    return analyses;
  }

  /**
   * Spieler zuweisen
   */
  static async assignPlayer(
    tbInstanceId: string,
    requirementId: string,
    memberId: string,
    assignedByUserId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Member und Roster laden
      const memberResult = await sql`
        SELECT gm.id, gm.ally_code, gm.player_name, gm.guild_id
        FROM guild_members gm
        WHERE gm.id = ${memberId}
      `;

      if (memberResult.rows.length === 0) {
        return { success: false, error: 'Member not found' };
      }

      const member = memberResult.rows[0];

      // Requirement laden
      const reqResult = await sql`
        SELECT tr.unit_base_id, tr.min_relic, tr.total_needed
        FROM tb_requirements tr
        WHERE tr.id = ${requirementId}
      `;

      if (reqResult.rows.length === 0) {
        return { success: false, error: 'Requirement not found' };
      }

      const req = reqResult.rows[0];

      // Prüfen ob Slot noch frei
      const existingCount = await sql`
        SELECT COUNT(*) as cnt
        FROM tb_assignments
        WHERE tb_instance_id = ${tbInstanceId}
          AND tb_requirement_id = ${requirementId}
      `;

      if (parseInt(existingCount.rows[0].cnt) >= req.total_needed) {
        return { success: false, error: 'All slots for this requirement are filled' };
      }

      // Spieler-Relic laden
      const rosterResult = await sql`
        SELECT relic_tier
        FROM roster_cache
        WHERE ally_code = ${member.ally_code}
          AND unit_base_id = ${req.unit_base_id}
          AND guild_id = ${member.guild_id}
      `;

      const relicTier = rosterResult.rows[0]?.relic_tier || 0;

      // Zuweisung erstellen
      await sql`
        INSERT INTO tb_assignments (
          id, tb_instance_id, tb_requirement_id, guild_member_id,
          ally_code, unit_base_id, assigned_by,
          status, player_relic_at_assignment
        ) VALUES (
          gen_random_uuid(), ${tbInstanceId}, ${requirementId}, ${memberId},
          ${member.ally_code}, ${req.unit_base_id}, ${assignedByUserId},
          'assigned', ${relicTier}
        )
        ON CONFLICT (tb_instance_id, tb_requirement_id, guild_member_id)
        DO UPDATE SET
          status = 'assigned',
          player_relic_at_assignment = ${relicTier},
          assigned_by = ${assignedByUserId},
          updated_at = NOW()
      `;

      return { success: true };
    } catch (error: any) {
      console.error('Assignment error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Zuweisung entfernen
   */
  static async unassignPlayer(
    assignmentId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await sql`DELETE FROM tb_assignments WHERE id = ${assignmentId}`;
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Auto-Assign: Automatisch die besten Kandidaten zuweisen
   */
  static async autoAssignZone(
    tbInstanceId: string,
    phase: number,
    zoneCode: string,
    assignedByUserId: string
  ): Promise<{ assigned: number; skipped: number; errors: string[] }> {
    const analysis = await this.analyzeZone(tbInstanceId, phase, zoneCode);

    let assigned = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Globale Tracking welche Spieler+Units bereits vergeben
    const usedPlayerUnits = new Set<string>();

    // Bestehende Zuweisungen tracken
    for (const unit of analysis.units) {
      for (const ap of unit.assignedPlayers) {
        usedPlayerUnits.add(`${ap.allyCode}:${unit.requirement.unitBaseId}`);
      }
    }

    // Nach Dringlichkeit sortieren: Units mit wenigsten Kandidaten zuerst
    const sortedUnits = [...analysis.units]
      .filter(u => u.gapCount > 0)
      .sort((a, b) => a.qualifiedPlayers.length - b.qualifiedPlayers.length);

    for (const unit of sortedUnits) {
      const slotsToFill = unit.gapCount;

      for (let i = 0; i < slotsToFill; i++) {
        // Besten verfügbaren Kandidaten finden
        const candidate = unit.qualifiedPlayers.find(
          p => !usedPlayerUnits.has(`${p.allyCode}:${unit.requirement.unitBaseId}`)
        );

        if (!candidate) {
          skipped++;
          continue;
        }

        const result = await this.assignPlayer(
          tbInstanceId,
          unit.requirement.requirementId,
          candidate.memberId,
          assignedByUserId
        );

        if (result.success) {
          assigned++;
          usedPlayerUnits.add(`${candidate.allyCode}:${unit.requirement.unitBaseId}`);
        } else {
          errors.push(`${unit.requirement.unitName}: ${result.error}`);
        }
      }
    }

    return { assigned, skipped, errors };
  }
}