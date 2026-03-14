import { sql } from '@vercel/postgres';

import type {
  AssignedPlayer,
  GapAnalysisUnit,
  PlayerCandidate,
  SlotOpenReason,
  ZoneGapSummary,
} from '@/lib/types/tb';
import {
  matchZone,
  type MatcherLockedAssignment,
  type MatcherRosterEntry,
  type MatcherSlot,
  MAX_ASSIGNMENTS_PER_MEMBER_PER_ZONE,
} from '@/lib/services/tb-zone-matcher';
import { toNumber } from '@/lib/utils/to-number';

// ---------------------------------------------------------------------------
// Internal row types
// ---------------------------------------------------------------------------

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
  is_bonus: boolean;
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
  lock_type: string;
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

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

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

    if (result.rows.length === 0) throw new Error('TB instance not found');

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
  ): Promise<Array<{ zoneKey: string; zoneName: string; isBonus: boolean }>> {
    const result = await sql<ZoneRow>`
      SELECT tz.zone_key, tz.name AS zone_name, tz.is_bonus
      FROM tb_zones tz
      JOIN tb_phases tp ON tp.id = tz.tb_phase_id
      WHERE tp.tb_definition_id = ${definitionId}
        AND tp.phase_number = ${phase}
      ORDER BY tz.is_bonus ASC, tz.sort_order ASC, tz.name ASC
    `;
    return result.rows.map((row) => ({
      zoneKey: row.zone_key,
      zoneName: row.zone_name,
      isBonus: Boolean(row.is_bonus),
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

  /**
   * Returns all assignments for the given phase, with lock_type included.
   * Used for gap analysis (read-only; covers all zones in phase).
   */
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
        ta.lock_type,
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

  /**
   * Returns assignments for a single zone.
   * Used by recompute / simulation flows.
   */
  private static async getZoneAssignments(
    instanceId: string,
    phase: number,
    zoneKey: string
  ): Promise<AssignmentRow[]> {
    const result = await sql<AssignmentRow>`
      SELECT
        ta.id AS assignment_id,
        ta.tb_platoon_slot_id,
        ta.guild_member_id,
        ta.ally_code,
        ta.unit_base_id,
        ta.status,
        ta.lock_type,
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
        AND tz.zone_key = ${zoneKey}
    `;
    return result.rows;
  }

  /**
   * Returns `${allyCode}:${unitBaseId}` keys for assignments in OTHER zones
   * of the same phase.  Used to prevent assigning the same unit twice in a phase.
   */
  private static async getPhaseUnitKeysForOtherZones(
    instanceId: string,
    phase: number,
    zoneKey: string
  ): Promise<Set<string>> {
    const result = await sql<{ ally_code: string; unit_base_id: string }>`
      SELECT ta.ally_code, ta.unit_base_id
      FROM tb_assignments ta
      JOIN tb_platoon_slots tps ON tps.id = ta.tb_platoon_slot_id
      JOIN tb_platoons tpl ON tpl.id = tps.tb_platoon_id
      JOIN tb_zones tz ON tz.id = tpl.tb_zone_id
      JOIN tb_phases tp ON tp.id = tz.tb_phase_id
      WHERE ta.tb_instance_id = ${instanceId}
        AND tp.phase_number = ${phase}
        AND tz.zone_key <> ${zoneKey}
    `;
    return new Set(result.rows.map((r) => `${r.ally_code}:${r.unit_base_id}`));
  }

  private static async getRosterByUnit(
    guildId: string,
    unitBaseIds: string[]
  ): Promise<Record<string, RosterRow[]>> {
    const uniqueIds = [...new Set(unitBaseIds.filter((id) => id.trim()))];
    if (uniqueIds.length === 0) return {};

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
      [guildId, uniqueIds]
    );

    const byUnit = uniqueIds.reduce<Record<string, RosterRow[]>>((acc, id) => {
      acc[id] = [];
      return acc;
    }, {});

    for (const row of result.rows) {
      (byUnit[row.unit_base_id] ??= []).push(row);
    }
    return byUnit;
  }

  // ---------------------------------------------------------------------------
  // Gap analysis (read-only display)
  // ---------------------------------------------------------------------------

  private static buildRosterMapForMatcher(
    rosterByUnit: Record<string, RosterRow[]>
  ): Map<string, MatcherRosterEntry[]> {
    const map = new Map<string, MatcherRosterEntry[]>();
    for (const [unitBaseId, rows] of Object.entries(rosterByUnit)) {
      map.set(
        unitBaseId,
        rows.map((r) => ({
          memberId: r.member_id,
          allyCode: r.ally_code,
          playerName: r.player_name,
          relicTier: toNumber(r.relic_tier),
          rarity: toNumber(r.rarity),
        }))
      );
    }
    return map;
  }

  private static async buildZoneAnalysis(
    instance: InstanceContext,
    phase: number,
    zoneKey: string,
    isBonus = false
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
        isBonus,
        totalSlots: 0,
        filledSlots: 0,
        readySlots: 0,
        gapSlots: 0,
        completionPercent: 0,
        units: [],
      };
    }

    // All phase assignments (for phase-level duplicate-unit detection).
    const phaseAssignments = await this.getPhaseAssignments(instance.instanceId, phase);

    // Phase-wide unit occupation: allyCode:unitBaseId → count
    const phaseUnitCounts: Record<string, number> = {};
    // Zone-scoped assignment count per player (for capacity scoring).
    const zoneCountsByPlayer: Record<string, number> = {};
    // Per-slot assignment list (zone only).
    const assignmentsBySlotId: Record<string, AssignedPlayer[]> = {};

    for (const a of phaseAssignments) {
      const unitKey = `${a.ally_code}:${a.unit_base_id}`;
      phaseUnitCounts[unitKey] = (phaseUnitCounts[unitKey] || 0) + 1;

      if (a.zone_key === zoneKey) {
        zoneCountsByPlayer[a.ally_code] = (zoneCountsByPlayer[a.ally_code] || 0) + 1;
      }
    }

    for (const a of phaseAssignments) {
      if (a.zone_key !== zoneKey) continue;
      const unitKey = `${a.ally_code}:${a.unit_base_id}`;
      (assignmentsBySlotId[a.tb_platoon_slot_id] ??= []).push({
        assignmentId: a.assignment_id,
        allyCode: a.ally_code,
        playerName: a.player_name,
        memberId: a.guild_member_id,
        relicTier: toNumber(a.player_relic_at_assignment),
        status: a.status,
        lockType: (a.lock_type === 'LOCKED' ? 'LOCKED' : 'FLEX') as 'LOCKED' | 'FLEX',
        hasConflict: phaseUnitCounts[unitKey] > 1,
      });
    }

    const rosterByUnit = await this.getRosterByUnit(
      instance.guildId,
      [...new Set(slots.map((s) => s.unit_base_id))]
    );

    let totalSlots = 0;
    let filledSlots = 0;
    let readySlots = 0;

    const units: GapAnalysisUnit[] = slots.map((slot) => {
      const assignedPlayers = assignmentsBySlotId[slot.tb_platoon_slot_id] ?? [];
      const rosterEntries = rosterByUnit[slot.unit_base_id] ?? [];
      const requiredRelicTier = toNumber(slot.required_relic_tier);
      const requiredRarity = toNumber(slot.required_rarity) || 7;

      totalSlots += 1;
      filledSlots += assignedPlayers.length > 0 ? 1 : 0;

      const qualifiedPlayers: PlayerCandidate[] = [];
      const nearMissPlayers: PlayerCandidate[] = [];

      for (const player of rosterEntries) {
        if (assignedPlayers.some((a) => a.allyCode === player.ally_code)) continue;

        const playerRelicTier = toNumber(player.relic_tier);
        const playerRarity = toNumber(player.rarity);
        const relicDeficit = Math.max(0, requiredRelicTier - playerRelicTier);
        const rarityDeficit = Math.max(0, requiredRarity - playerRarity);
        // Phase-scoped duplicate check (same unit in any other zone this phase).
        const alreadyAssignedElsewhere =
          (phaseUnitCounts[`${player.ally_code}:${player.unit_base_id}`] ?? 0) > 0;
        // Zone-scoped assignment count for capacity display.
        const assignmentCount = zoneCountsByPlayer[player.ally_code] || 0;
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

      qualifiedPlayers.sort((a, b) => a.score - b.score);
      nearMissPlayers.sort((a, b) => a.score - b.score);

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

      if (assignedCount > 0 || qualifiedPlayers.length > 0) readySlots += 1;

      // Compute openReason for unassigned slots.
      let openReason: SlotOpenReason = null;
      if (assignedCount === 0) {
        if (qualifiedPlayers.length === 0) {
          openReason = 'no_eligible_member';
        } else {
          // All qualified candidates at zone capacity?
          const allAtCap = qualifiedPlayers.every(
            (c) => c.assignmentCount >= MAX_ASSIGNMENTS_PER_MEMBER_PER_ZONE
          );
          if (allAtCap) openReason = 'eligible_at_capacity';
        }
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
        openReason,
        qualifiedPlayers: qualifiedPlayers.slice(0, 10),
        nearMissPlayers: nearMissPlayers.slice(0, 5),
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
      isBonus,
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
      zones.map((z) => this.buildZoneAnalysis(instance, phase, z.zoneKey, z.isBonus))
    );
  }

  static async analyzeZone(
    tbInstanceId: string,
    phase: number,
    zoneKey: string
  ): Promise<ZoneGapSummary> {
    const instance = await this.getInstanceContext(tbInstanceId);
    // isBonus can be derived from the zone key pattern; the caller may not know it.
    const isBonus = zoneKey.includes('-bonus-');
    return this.buildZoneAnalysis(instance, phase, zoneKey, isBonus);
  }

  // ---------------------------------------------------------------------------
  // Recompute FLEX assignments for a zone
  //
  // Deletes all FLEX assignments for the zone and re-runs the zone matcher.
  // LOCKED assignments are preserved and treated as constraints.
  // Called after a manual (LOCKED) assignment and by autoAssignZone.
  // ---------------------------------------------------------------------------

  private static async recomputeFlexForZone(
    instance: InstanceContext,
    phase: number,
    zoneKey: string,
    assignedByUserId: string
  ): Promise<{ assigned: number; openSlots: number }> {
    const [slots, zoneAssignments, phaseUnitKeys] = await Promise.all([
      this.getSlotsForZone(instance.definitionId, phase, zoneKey),
      this.getZoneAssignments(instance.instanceId, phase, zoneKey),
      this.getPhaseUnitKeysForOtherZones(instance.instanceId, phase, zoneKey),
    ]);

    const lockedAssignments: MatcherLockedAssignment[] = zoneAssignments
      .filter((a) => a.lock_type === 'LOCKED')
      .map((a) => ({
        slotId: a.tb_platoon_slot_id,
        memberId: a.guild_member_id,
        allyCode: a.ally_code,
        unitBaseId: a.unit_base_id,
      }));

    const rosterByUnit = await this.getRosterByUnit(
      instance.guildId,
      [...new Set(slots.map((s) => s.unit_base_id))]
    );

    const matcherSlots: MatcherSlot[] = slots.map((s) => ({
      slotId: s.tb_platoon_slot_id,
      unitBaseId: s.unit_base_id,
      minRelic: toNumber(s.required_relic_tier),
      minRarity: toNumber(s.required_rarity) || 7,
    }));

    const result = matchZone(
      matcherSlots,
      this.buildRosterMapForMatcher(rosterByUnit),
      lockedAssignments,
      phaseUnitKeys
    );

    // Write changes in a transaction: delete old FLEX, insert new FLEX.
    await sql`BEGIN`;
    try {
      // Delete all FLEX for this zone.
      await sql`
        DELETE FROM tb_assignments
        WHERE tb_instance_id = ${instance.instanceId}
          AND lock_type = 'FLEX'
          AND tb_platoon_slot_id IN (
            SELECT tps.id
            FROM tb_platoon_slots tps
            JOIN tb_platoons tpl ON tpl.id = tps.tb_platoon_id
            JOIN tb_zones tz ON tz.id = tpl.tb_zone_id
            JOIN tb_phases tp ON tp.id = tz.tb_phase_id
            WHERE tp.tb_definition_id = ${instance.definitionId}
              AND tp.phase_number = ${phase}
              AND tz.zone_key = ${zoneKey}
          )
      `;

      // Insert new FLEX proposals.
      for (const proposal of result.proposals) {
        // Look up the relic tier for the assigned player from rosterByUnit.
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
            lock_type,
            player_relic_at_assignment
          ) VALUES (
            gen_random_uuid(),
            ${instance.instanceId},
            ${proposal.slotId},
            ${proposal.memberId},
            ${proposal.allyCode},
            ${proposal.unitBaseId},
            ${assignedByUserId},
            'assigned',
            'FLEX',
            ${proposal.relicTier}
          )
          ON CONFLICT (tb_instance_id, tb_platoon_slot_id)
          DO UPDATE SET
            guild_member_id = EXCLUDED.guild_member_id,
            ally_code       = EXCLUDED.ally_code,
            unit_base_id    = EXCLUDED.unit_base_id,
            assigned_by     = EXCLUDED.assigned_by,
            lock_type       = 'FLEX',
            player_relic_at_assignment = EXCLUDED.player_relic_at_assignment,
            updated_at      = NOW()
        `;
      }

      await sql`COMMIT`;
    } catch (err) {
      await sql`ROLLBACK`;
      throw err;
    }

    return { assigned: result.proposals.length, openSlots: result.openSlots.length };
  }

  // ---------------------------------------------------------------------------
  // Manual assignment (LOCKED)
  // ---------------------------------------------------------------------------

  static async assignPlayer(
    tbInstanceId: string,
    tbPlatoonSlotId: string,
    memberId: string,
    assignedByUserId: string
  ): Promise<{ success: boolean; error?: string }> {
    const instance = await this.getInstanceContext(tbInstanceId);

    // ── validate member ──────────────────────────────────────────────────────
    const memberResult = await sql<{ id: string; ally_code: string; guild_id: string }>`
      SELECT gm.id, gm.ally_code, gm.guild_id
      FROM guild_members gm
      WHERE gm.id = ${memberId}
    `;
    if (memberResult.rows.length === 0) return { success: false, error: 'Member not found' };

    const member = memberResult.rows[0];
    if (member.guild_id !== instance.guildId)
      return { success: false, error: 'Member does not belong to this guild' };

    // ── validate slot ────────────────────────────────────────────────────────
    const slotResult = await sql<{
      tb_platoon_slot_id: string;
      unit_base_id: string;
      required_relic_tier: string | number | null;
      required_rarity: string | number | null;
      phase_number: string | number;
      zone_key: string;
    }>`
      SELECT
        tps.id AS tb_platoon_slot_id,
        tps.unit_base_id,
        tps.required_relic_tier,
        tps.required_rarity,
        tp.phase_number,
        tz.zone_key
      FROM tb_platoon_slots tps
      JOIN tb_platoons tpl ON tpl.id = tps.tb_platoon_id
      JOIN tb_zones tz ON tz.id = tpl.tb_zone_id
      JOIN tb_phases tp ON tp.id = tz.tb_phase_id
      WHERE tps.id = ${tbPlatoonSlotId}
        AND tp.tb_definition_id = ${instance.definitionId}
    `;
    if (slotResult.rows.length === 0)
      return { success: false, error: 'Platoon slot not found' };

    const slot = slotResult.rows[0];
    const phase = toNumber(slot.phase_number);
    const zoneKey = slot.zone_key;

    // ── check member owns the unit and meets requirements ────────────────────
    const rosterResult = await sql<{ rarity: string | number | null; relic_tier: string | number | null }>`
      SELECT rarity, relic_tier
      FROM roster_cache
      WHERE ally_code = ${member.ally_code}
        AND unit_base_id = ${slot.unit_base_id}
        AND guild_id = ${instance.guildId}
    `;
    if (rosterResult.rows.length === 0)
      return { success: false, error: 'Member does not own the required unit' };

    const requiredRelicTier = toNumber(slot.required_relic_tier);
    const requiredRarity = toNumber(slot.required_rarity) || 7;
    const playerRarity = toNumber(rosterResult.rows[0].rarity);
    const relicTier = toNumber(rosterResult.rows[0].relic_tier);

    if (playerRarity < requiredRarity || relicTier < requiredRelicTier)
      return { success: false, error: 'Member does not meet the platoon requirements' };

    // ── same-unit duplicate check across phase ───────────────────────────────
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
        AND tp.phase_number = ${phase}
        AND ta.tb_platoon_slot_id <> ${tbPlatoonSlotId}
      LIMIT 1
    `;
    if (duplicateResult.rows.length > 0)
      return {
        success: false,
        error: 'This unit is already assigned to another platoon slot in the same phase',
      };

    // ── zone capacity check ──────────────────────────────────────────────────
    // Count how many assignments the member already has in this zone (excluding the
    // target slot, which may already be assigned to them).
    const zoneCapResult = await sql<{ zone_count: string | number }>`
      SELECT COUNT(*) AS zone_count
      FROM tb_assignments ta
      JOIN tb_platoon_slots tps ON tps.id = ta.tb_platoon_slot_id
      JOIN tb_platoons tpl ON tpl.id = tps.tb_platoon_id
      JOIN tb_zones tz ON tz.id = tpl.tb_zone_id
      JOIN tb_phases tp ON tp.id = tz.tb_phase_id
      WHERE ta.tb_instance_id = ${tbInstanceId}
        AND ta.guild_member_id = ${memberId}
        AND tp.phase_number = ${phase}
        AND tz.zone_key = ${zoneKey}
        AND ta.tb_platoon_slot_id <> ${tbPlatoonSlotId}
    `;
    const currentZoneCount = toNumber(zoneCapResult.rows[0]?.zone_count ?? 0);
    if (currentZoneCount >= MAX_ASSIGNMENTS_PER_MEMBER_PER_ZONE)
      return { success: false, error: 'Member has reached the zone assignment cap (10)' };

    // ── simulation: ensure manual LOCKED assignment does not reduce zone coverage ─
    //
    // filledBefore = number of slots currently assigned (LOCKED + FLEX) in this zone.
    // We simulate the zone after the new LOCKED assignment + full FLEX recompute and
    // compare.  If filledAfter < filledBefore we reject to protect overall coverage.
    const zoneAssignmentsBefore = await this.getZoneAssignments(
      instance.instanceId,
      phase,
      zoneKey
    );
    const filledBefore = new Set(
      zoneAssignmentsBefore.map((a) => a.tb_platoon_slot_id)
    ).size;

    // Build simulation inputs.
    const simSlots = await this.getSlotsForZone(instance.definitionId, phase, zoneKey);
    const [phaseUnitKeys, simRosterByUnit] = await Promise.all([
      this.getPhaseUnitKeysForOtherZones(instance.instanceId, phase, zoneKey),
      this.getRosterByUnit(
        instance.guildId,
        [...new Set(simSlots.map((s) => s.unit_base_id))]
      ),
    ]);

    // LOCKED assignments after the change: existing LOCKEDs + new one.
    const existingLocked: MatcherLockedAssignment[] = zoneAssignmentsBefore
      .filter((a) => a.lock_type === 'LOCKED' && a.tb_platoon_slot_id !== tbPlatoonSlotId)
      .map((a) => ({
        slotId: a.tb_platoon_slot_id,
        memberId: a.guild_member_id,
        allyCode: a.ally_code,
        unitBaseId: a.unit_base_id,
      }));

    const newLocked: MatcherLockedAssignment = {
      slotId: tbPlatoonSlotId,
      memberId,
      allyCode: member.ally_code,
      unitBaseId: slot.unit_base_id,
    };

    // Remove the target slot's existing entry from phaseUnitKeys if it was there
    // (the member will occupy it via the new LOCKED assignment instead).
    const simPhaseKeys = new Set<string>(phaseUnitKeys);

    const simResult = matchZone(
      simSlots.map((s) => ({
        slotId: s.tb_platoon_slot_id,
        unitBaseId: s.unit_base_id,
        minRelic: toNumber(s.required_relic_tier),
        minRarity: toNumber(s.required_rarity) || 7,
      })),
      this.buildRosterMapForMatcher(simRosterByUnit),
      [...existingLocked, newLocked],
      simPhaseKeys
    );

    const filledAfter = simResult.filledCount;
    if (filledAfter < filledBefore) {
      return {
        success: false,
        error: `Manual assignment would reduce zone coverage (${filledBefore} → ${filledAfter} filled slots). Choose a different member or clear conflicting assignments first.`,
      };
    }

    // ── commit: write LOCKED, then recompute FLEX ────────────────────────────
    await sql`BEGIN`;
    try {
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
          lock_type,
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
          'LOCKED',
          ${relicTier}
        )
        ON CONFLICT (tb_instance_id, tb_platoon_slot_id)
        DO UPDATE SET
          guild_member_id = EXCLUDED.guild_member_id,
          ally_code       = EXCLUDED.ally_code,
          unit_base_id    = EXCLUDED.unit_base_id,
          assigned_by     = EXCLUDED.assigned_by,
          lock_type       = 'LOCKED',
          player_relic_at_assignment = EXCLUDED.player_relic_at_assignment,
          updated_at      = NOW()
      `;
      await sql`COMMIT`;
    } catch (err) {
      await sql`ROLLBACK`;
      throw err;
    }

    // Recompute FLEX outside the first transaction (independent operation).
    await this.recomputeFlexForZone(instance, phase, zoneKey, assignedByUserId);

    return { success: true };
  }

  // ---------------------------------------------------------------------------
  // Unassign  (deletes assignment and recomputes FLEX for the zone)
  // ---------------------------------------------------------------------------

  static async unassignPlayer(
    tbInstanceId: string,
    assignmentId: string,
    unassignedByUserId: string
  ): Promise<{ success: boolean }> {
    // Look up zone context before deleting so we can recompute FLEX afterwards.
    const contextResult = await sql<{
      phase_number: string | number;
      zone_key: string;
    }>`
      SELECT tp.phase_number, tz.zone_key
      FROM tb_assignments ta
      JOIN tb_platoon_slots tps ON tps.id = ta.tb_platoon_slot_id
      JOIN tb_platoons tpl ON tpl.id = tps.tb_platoon_id
      JOIN tb_zones tz ON tz.id = tpl.tb_zone_id
      JOIN tb_phases tp ON tp.id = tz.tb_phase_id
      WHERE ta.id = ${assignmentId}
        AND ta.tb_instance_id = ${tbInstanceId}
    `;

    if (contextResult.rows.length === 0) return { success: false };

    const { phase_number, zone_key } = contextResult.rows[0];
    const phase = toNumber(phase_number);
    const zoneKey = zone_key;

    const deleteResult = await sql<{ id: string }>`
      DELETE FROM tb_assignments
      WHERE id = ${assignmentId}
        AND tb_instance_id = ${tbInstanceId}
      RETURNING id
    `;

    if (deleteResult.rows.length === 0) return { success: false };

    // Recompute FLEX for the zone so the vacated slot can be filled automatically.
    const instance = await this.getInstanceContext(tbInstanceId);
    await this.recomputeFlexForZone(instance, phase, zoneKey, unassignedByUserId);

    return { success: true };
  }

  // ---------------------------------------------------------------------------
  // Auto-assign zone (FLEX only)
  // ---------------------------------------------------------------------------

  static async autoAssignZone(
    tbInstanceId: string,
    phase: number,
    zoneKey: string,
    assignedByUserId: string
  ): Promise<{ success: boolean; assigned: number; skipped: number; errors: string[] }> {
    const instance = await this.getInstanceContext(tbInstanceId);
    const { assigned, openSlots } = await this.recomputeFlexForZone(
      instance,
      phase,
      zoneKey,
      assignedByUserId
    );
    return { success: true, assigned, skipped: openSlots, errors: [] };
  }
}
