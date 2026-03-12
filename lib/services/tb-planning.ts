import { sql } from '@vercel/postgres';

import type {
  AssignedPlayer,
  GapAnalysisUnit,
  PlayerCandidate,
  ZoneGapSummary,
} from '@/lib/types/tb';
import { toNumber } from '@/lib/utils/to-number';

type InstanceContext = {
  instanceId: string;
  guildId: string;
  definitionId: string;
  tbKey: string;
  tbName: string;
  totalPhases: number;
};

type ZoneRow = {
  zone_key: string;
  zone_name: string;
};

type SlotRow = {
  tb_platoon_slot_id: string;
  slot_key: string;
  slot_number: string | number;
  unit_base_id: string;
  unit_name: string | null;
  required_relic_tier: string | number | null;
  required_rarity: string | number | null;
  tb_platoon_id: string;
  platoon_key: string;
  platoon_number: string | number;
  zone_key: string;
  zone_name: string;
};

type AssignmentRow = {
  assignment_id: string;
  tb_platoon_slot_id: string;
  guild_member_id: string;
  ally_code: string;
  unit_base_id: string;
  status: string;
  player_relic_at_assignment: string | number | null;
  player_name: string;
  zone_key: string;
};

type RosterRow = {
  ally_code: string;
  unit_base_id: string;
  unit_name: string;
  relic_tier: string | number;
  rarity: string | number;
  gear_level: string | number;
  galactic_power: string | number;
  player_name: string;
  member_id: string;
};

type BuildAnalysisOptions = {
  trimCandidates: boolean;
};

export class TbPlanningService {
  private static async getInstanceContext(instanceId: string): Promise<InstanceContext> {
    const result = await sql<{
      instance_id: string;
      guild_id: string;
      definition_id: string;
      tb_key: string;
      tb_name: string;
      total_phases: string | number;
    }>`
      SELECT
        ti.id AS instance_id,
        ti.guild_id,
        td.id AS definition_id,
        td.tb_key,
        td.name AS tb_name,
        td.total_phases
      FROM tb_instances ti
      JOIN tb_definitions td ON td.id = ti.tb_definition_id
      WHERE ti.id = ${instanceId}
    `;

    if (result.rows.length === 0) {
      throw new Error('TB instance not found');
    }

    const row = result.rows[0];

    return {
      instanceId: row.instance_id,
      guildId: row.guild_id,
      definitionId: row.definition_id,
      tbKey: row.tb_key,
      tbName: row.tb_name,
      totalPhases: toNumber(row.total_phases) || 6,
    };
  }

  private static async getZonesForPhase(
    definitionId: string,
    phase: number
  ): Promise<Array<{ zoneKey: string; zoneName: string }>> {
    const result = await sql<ZoneRow>`
      SELECT tz.zone_key, tz.name AS zone_name
      FROM tb_zones tz
      JOIN tb_phases tp ON tp.id = tz.tb_phase_id
      WHERE tp.tb_definition_id = ${definitionId}
        AND tp.phase_number = ${phase}
      ORDER BY tz.sort_order ASC, tz.name ASC
    `;

    return result.rows.map((row) => ({
      zoneKey: row.zone_key,
      zoneName: row.zone_name,
    }));
  }

  private static async getSlotsForZone(
    definitionId: string,
    phase: number,
    zoneKey: string
  ): Promise<SlotRow[]> {
    const result = await sql<SlotRow>`
      SELECT
        tps.id AS tb_platoon_slot_id,
        tps.slot_key,
        tps.slot_number,
        tps.unit_base_id,
        tps.unit_name,
        tps.required_relic_tier,
        tps.required_rarity,
        tpl.id AS tb_platoon_id,
        tpl.platoon_key,
        tpl.platoon_number,
        tz.zone_key,
        tz.name AS zone_name
      FROM tb_platoon_slots tps
      JOIN tb_platoons tpl ON tpl.id = tps.tb_platoon_id
      JOIN tb_zones tz ON tz.id = tpl.tb_zone_id
      JOIN tb_phases tp ON tp.id = tz.tb_phase_id
      WHERE tp.tb_definition_id = ${definitionId}
        AND tp.phase_number = ${phase}
        AND tz.zone_key = ${zoneKey}
      ORDER BY tpl.sort_order ASC, tps.slot_number ASC
    `;

    return result.rows;
  }

  private static async getPhaseAssignments(
    instanceId: string,
    phase: number
  ): Promise<AssignmentRow[]> {
    const result = await sql<AssignmentRow>`
      SELECT
        ta.id AS assignment_id,
        ta.tb_platoon_slot_id,
        ta.guild_member_id,
        ta.ally_code,
        ta.unit_base_id,
        ta.status,
        ta.player_relic_at_assignment,
        gm.player_name,
        tz.zone_key
      FROM tb_assignments ta
      JOIN guild_members gm ON gm.id = ta.guild_member_id
      JOIN tb_platoon_slots tps ON tps.id = ta.tb_platoon_slot_id
      JOIN tb_platoons tpl ON tpl.id = tps.tb_platoon_id
      JOIN tb_zones tz ON tz.id = tpl.tb_zone_id
      JOIN tb_phases tp ON tp.id = tz.tb_phase_id
      WHERE ta.tb_instance_id = ${instanceId}
        AND tp.phase_number = ${phase}
    `;

    return result.rows;
  }

  private static async getRosterByUnit(
    guildId: string,
    unitBaseIds: string[]
  ): Promise<Record<string, RosterRow[]>> {
    const uniqueUnitBaseIds = [...new Set(unitBaseIds.filter((unitBaseId) => unitBaseId.trim()))];

    if (uniqueUnitBaseIds.length === 0) {
      return {};
    }

    const result = await sql.query<RosterRow>(
      `
        SELECT
          rc.ally_code,
          rc.unit_base_id,
          rc.unit_name,
          rc.relic_tier,
          rc.rarity,
          rc.gear_level,
          rc.galactic_power,
          gm.player_name,
          gm.id AS member_id
        FROM roster_cache rc
        JOIN guild_members gm
          ON gm.ally_code = rc.ally_code AND gm.guild_id = rc.guild_id
        WHERE rc.guild_id = $1
          AND rc.unit_base_id = ANY($2::text[])
        ORDER BY rc.unit_base_id ASC, rc.relic_tier DESC, rc.rarity DESC, rc.galactic_power DESC
      `,
      [guildId, uniqueUnitBaseIds]
    );

    const rosterByUnit = uniqueUnitBaseIds.reduce<Record<string, RosterRow[]>>(
      (accumulator, unitBaseId) => {
        accumulator[unitBaseId] = [];
        return accumulator;
      },
      {}
    );

    for (const row of result.rows) {
      if (!rosterByUnit[row.unit_base_id]) {
        rosterByUnit[row.unit_base_id] = [];
      }

      rosterByUnit[row.unit_base_id].push(row);
    }

    return rosterByUnit;
  }

  private static async buildZoneAnalysis(
    instance: InstanceContext,
    phase: number,
    zoneKey: string,
    options: BuildAnalysisOptions
  ): Promise<ZoneGapSummary> {
    const slots = await this.getSlotsForZone(instance.definitionId, phase, zoneKey);

    if (slots.length === 0) {
      return {
        tbInstanceId: instance.instanceId,
        tbName: instance.tbName,
        totalPhases: instance.totalPhases,
        phase,
        zoneKey,
        zoneName: zoneKey,
        totalSlots: 0,
        filledSlots: 0,
        readySlots: 0,
        gapSlots: 0,
        completionPercent: 0,
        units: [],
      };
    }

    const phaseAssignments = await this.getPhaseAssignments(instance.instanceId, phase);
    const assignmentsBySlotId: Record<string, AssignedPlayer[]> = {};
    const assignmentCountsByPlayer: Record<string, number> = {};
    const assignedUnitCounts: Record<string, number> = {};
    const allAssignedKeys = new Set<string>();

    for (const assignment of phaseAssignments) {
      assignmentCountsByPlayer[assignment.ally_code] =
        (assignmentCountsByPlayer[assignment.ally_code] || 0) + 1;

      const assignmentUnitKey = `${assignment.ally_code}:${assignment.unit_base_id}`;
      assignedUnitCounts[assignmentUnitKey] = (assignedUnitCounts[assignmentUnitKey] || 0) + 1;
      allAssignedKeys.add(assignmentUnitKey);
    }

    for (const assignment of phaseAssignments) {
      if (assignment.zone_key !== zoneKey) {
        continue;
      }

      if (!assignmentsBySlotId[assignment.tb_platoon_slot_id]) {
        assignmentsBySlotId[assignment.tb_platoon_slot_id] = [];
      }

      assignmentsBySlotId[assignment.tb_platoon_slot_id].push({
        assignmentId: assignment.assignment_id,
        allyCode: assignment.ally_code,
        playerName: assignment.player_name,
        memberId: assignment.guild_member_id,
        relicTier: toNumber(assignment.player_relic_at_assignment),
        status: assignment.status,
        hasConflict:
          assignedUnitCounts[`${assignment.ally_code}:${assignment.unit_base_id}`] > 1,
      });
    }

    const rosterByUnit = await this.getRosterByUnit(
      instance.guildId,
      [...new Set(slots.map((slot) => slot.unit_base_id))]
    );

    let totalSlots = 0;
    let filledSlots = 0;
    let readySlots = 0;

    const units: GapAnalysisUnit[] = slots.map((slot) => {
      const assignedPlayers = assignmentsBySlotId[slot.tb_platoon_slot_id] || [];
      const rosterEntries = rosterByUnit[slot.unit_base_id] || [];
      const requiredRelicTier = toNumber(slot.required_relic_tier);
      const requiredRarity = toNumber(slot.required_rarity) || 7;

      totalSlots += 1;
      filledSlots += assignedPlayers.length > 0 ? 1 : 0;

      const qualifiedPlayers: PlayerCandidate[] = [];
      const nearMissPlayers: PlayerCandidate[] = [];

      for (const player of rosterEntries) {
        if (assignedPlayers.some((assigned) => assigned.allyCode === player.ally_code)) {
          continue;
        }

        const playerRelicTier = toNumber(player.relic_tier);
        const playerRarity = toNumber(player.rarity);
        const relicDeficit = Math.max(0, requiredRelicTier - playerRelicTier);
        const rarityDeficit = Math.max(0, requiredRarity - playerRarity);
        const alreadyAssignedElsewhere = allAssignedKeys.has(
          `${player.ally_code}:${player.unit_base_id}`
        );
        const assignmentCount = assignmentCountsByPlayer[player.ally_code] || 0;
        const score =
          relicDeficit * 100 +
          rarityDeficit * 50 +
          (alreadyAssignedElsewhere ? 500 : 0) +
          assignmentCount * 10 -
          playerRelicTier;

        const candidate: PlayerCandidate = {
          allyCode: player.ally_code,
          playerName: player.player_name,
          memberId: player.member_id,
          relicTier: playerRelicTier,
          rarity: playerRarity,
          relicDeficit,
          rarityDeficit,
          isAlreadyAssignedElsewhere: alreadyAssignedElsewhere,
          assignmentCount,
          score,
        };

        if (relicDeficit === 0 && rarityDeficit === 0) {
          qualifiedPlayers.push(candidate);
        } else if (relicDeficit <= 3 && rarityDeficit <= 1) {
          nearMissPlayers.push(candidate);
        }
      }

      qualifiedPlayers.sort((left, right) => left.score - right.score);
      nearMissPlayers.sort((left, right) => left.score - right.score);

      const assignedCount = assignedPlayers.length;
      const gapCount = assignedCount > 0 ? 0 : 1;
      let status: GapAnalysisUnit['status'] = 'empty';

      if (assignedCount > 0) {
        status = 'complete';
      } else if (qualifiedPlayers.length > 0) {
        status = 'partial';
      } else if (nearMissPlayers.length > 0) {
        status = 'critical';
      }

      if (assignedCount > 0 || qualifiedPlayers.length > 0) {
        readySlots += 1;
      }

      return {
        requirement: {
          tbPlatoonSlotId: slot.tb_platoon_slot_id,
          tbPlatoonSlotKey: slot.slot_key,
          tbPlatoonId: slot.tb_platoon_id,
          tbPlatoonKey: slot.platoon_key,
          platoonNumber: toNumber(slot.platoon_number),
          slotNumber: toNumber(slot.slot_number),
          unitBaseId: slot.unit_base_id,
          unitName: slot.unit_name,
          minRelic: requiredRelicTier,
          minRarity: requiredRarity,
          zoneKey: slot.zone_key,
        },
        totalNeeded: 1,
        fulfilledCount: assignedCount > 0 ? 1 : 0,
        assignedCount,
        gapCount,
        status,
        qualifiedPlayers: options.trimCandidates
          ? qualifiedPlayers.slice(0, 10)
          : qualifiedPlayers,
        nearMissPlayers: options.trimCandidates
          ? nearMissPlayers.slice(0, 5)
          : nearMissPlayers,
        assignedPlayers,
      };
    });

    return {
      tbInstanceId: instance.instanceId,
      tbName: instance.tbName,
      totalPhases: instance.totalPhases,
      phase,
      zoneKey,
      zoneName: slots[0].zone_name,
      totalSlots,
      filledSlots,
      readySlots,
      gapSlots: totalSlots - filledSlots,
      completionPercent: totalSlots > 0 ? Math.round((filledSlots / totalSlots) * 100) : 0,
      units,
    };
  }

  static async analyzePhase(tbInstanceId: string, phase: number): Promise<ZoneGapSummary[]> {
    const instance = await this.getInstanceContext(tbInstanceId);
    const zones = await this.getZonesForPhase(instance.definitionId, phase);

    return Promise.all(
      zones.map((zone) =>
        this.buildZoneAnalysis(instance, phase, zone.zoneKey, { trimCandidates: true })
      )
    );
  }

  static async analyzeZone(
    tbInstanceId: string,
    phase: number,
    zoneKey: string
  ): Promise<ZoneGapSummary> {
    const instance = await this.getInstanceContext(tbInstanceId);
    return this.buildZoneAnalysis(instance, phase, zoneKey, { trimCandidates: true });
  }

  static async assignPlayer(
    tbInstanceId: string,
    tbPlatoonSlotId: string,
    memberId: string,
    assignedByUserId: string
  ): Promise<{ success: boolean; error?: string }> {
    const instance = await this.getInstanceContext(tbInstanceId);

    const memberResult = await sql<{
      id: string;
      ally_code: string;
      guild_id: string;
    }>`
      SELECT gm.id, gm.ally_code, gm.guild_id
      FROM guild_members gm
      WHERE gm.id = ${memberId}
    `;

    if (memberResult.rows.length === 0) {
      return { success: false, error: 'Member not found' };
    }

    const member = memberResult.rows[0];
    if (member.guild_id !== instance.guildId) {
      return { success: false, error: 'Member does not belong to this guild' };
    }

    const slotResult = await sql<{
      tb_platoon_slot_id: string;
      unit_base_id: string;
      required_relic_tier: string | number | null;
      required_rarity: string | number | null;
      phase_number: string | number;
    }>`
      SELECT
        tps.id AS tb_platoon_slot_id,
        tps.unit_base_id,
        tps.required_relic_tier,
        tps.required_rarity,
        tp.phase_number
      FROM tb_platoon_slots tps
      JOIN tb_platoons tpl ON tpl.id = tps.tb_platoon_id
      JOIN tb_zones tz ON tz.id = tpl.tb_zone_id
      JOIN tb_phases tp ON tp.id = tz.tb_phase_id
      WHERE tps.id = ${tbPlatoonSlotId}
        AND tp.tb_definition_id = ${instance.definitionId}
    `;

    if (slotResult.rows.length === 0) {
      return { success: false, error: 'Platoon slot not found' };
    }

    const slot = slotResult.rows[0];

    const existingAssignmentResult = await sql<{
      guild_member_id: string;
    }>`
      SELECT guild_member_id
      FROM tb_assignments
      WHERE tb_instance_id = ${tbInstanceId}
        AND tb_platoon_slot_id = ${tbPlatoonSlotId}
    `;

    if (
      existingAssignmentResult.rows.length > 0 &&
      existingAssignmentResult.rows[0].guild_member_id !== memberId
    ) {
      return { success: false, error: 'This slot is already assigned' };
    }

    const rosterResult = await sql<{
      rarity: string | number | null;
      relic_tier: string | number | null;
    }>`
      SELECT rarity, relic_tier
      FROM roster_cache
      WHERE ally_code = ${member.ally_code}
        AND unit_base_id = ${slot.unit_base_id}
        AND guild_id = ${instance.guildId}
    `;

    if (rosterResult.rows.length === 0) {
      return { success: false, error: 'Member does not own the required unit' };
    }

    const duplicateResult = await sql`
      SELECT ta.id
      FROM tb_assignments ta
      JOIN tb_platoon_slots tps ON tps.id = ta.tb_platoon_slot_id
      JOIN tb_platoons tpl ON tpl.id = tps.tb_platoon_id
      JOIN tb_zones tz ON tz.id = tpl.tb_zone_id
      JOIN tb_phases tp ON tp.id = tz.tb_phase_id
      WHERE ta.tb_instance_id = ${tbInstanceId}
        AND ta.ally_code = ${member.ally_code}
        AND ta.unit_base_id = ${slot.unit_base_id}
        AND tp.phase_number = ${slot.phase_number}
        AND ta.tb_platoon_slot_id <> ${tbPlatoonSlotId}
      LIMIT 1
    `;

    if (duplicateResult.rows.length > 0) {
      return {
        success: false,
        error: 'This unit is already assigned to another platoon slot in the same phase',
      };
    }

    const requiredRelicTier = toNumber(slot.required_relic_tier);
    const requiredRarity = toNumber(slot.required_rarity) || 7;
    const playerRarity = toNumber(rosterResult.rows[0].rarity);
    const relicTier = toNumber(rosterResult.rows[0].relic_tier);

    if (playerRarity < requiredRarity || relicTier < requiredRelicTier) {
      return { success: false, error: 'Member does not meet the platoon requirements' };
    }

    await sql`
      INSERT INTO tb_assignments (
        id,
        tb_instance_id,
        tb_platoon_slot_id,
        guild_member_id,
        ally_code,
        unit_base_id,
        assigned_by,
        status,
        player_relic_at_assignment
      ) VALUES (
        gen_random_uuid(),
        ${tbInstanceId},
        ${tbPlatoonSlotId},
        ${memberId},
        ${member.ally_code},
        ${slot.unit_base_id},
        ${assignedByUserId},
        'assigned',
        ${relicTier}
      )
      ON CONFLICT (tb_instance_id, tb_platoon_slot_id)
      DO UPDATE SET
        guild_member_id = EXCLUDED.guild_member_id,
        ally_code = EXCLUDED.ally_code,
        unit_base_id = EXCLUDED.unit_base_id,
        assigned_by = EXCLUDED.assigned_by,
        status = EXCLUDED.status,
        player_relic_at_assignment = EXCLUDED.player_relic_at_assignment,
        updated_at = NOW()
    `;

    return { success: true };
  }

  static async unassignPlayer(
    tbInstanceId: string,
    assignmentId: string
  ): Promise<{ success: boolean }> {
    const result = await sql<{ id: string }>`
      DELETE FROM tb_assignments
      WHERE id = ${assignmentId}
        AND tb_instance_id = ${tbInstanceId}
      RETURNING id
    `;

    return { success: result.rows.length > 0 };
  }

  static async autoAssignZone(
    tbInstanceId: string,
    phase: number,
    zoneKey: string,
    assignedByUserId: string
  ): Promise<{ success: boolean; assigned: number; skipped: number; errors: string[] }> {
    const instance = await this.getInstanceContext(tbInstanceId);
    const analysis = await this.buildZoneAnalysis(instance, phase, zoneKey, {
      trimCandidates: false,
    });

    const usedAssignments = new Set<string>();

    let assigned = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const unit of analysis.units) {
      if (unit.assignedCount > 0) {
        continue;
      }

      const candidate = unit.qualifiedPlayers.find(
        (player) =>
          !player.isAlreadyAssignedElsewhere &&
          !usedAssignments.has(`${player.allyCode}:${unit.requirement.unitBaseId}`)
      );

      if (!candidate) {
        skipped += 1;
        continue;
      }

      const result = await this.assignPlayer(
        tbInstanceId,
        unit.requirement.tbPlatoonSlotId,
        candidate.memberId,
        assignedByUserId
      );

      if (!result.success) {
        skipped += 1;
        errors.push(
          `${unit.requirement.unitName || unit.requirement.unitBaseId}: ${result.error || 'assignment failed'}`
        );
        continue;
      }

      usedAssignments.add(`${candidate.allyCode}:${unit.requirement.unitBaseId}`);
      assigned += 1;
    }

    return { success: true, assigned, skipped, errors };
  }
}
