import { sql } from '@vercel/postgres';

import { getDemoPlatoonReadinessDataset } from '@/lib/services/platoon-readiness-fixture';
import { listGuildUpgradeAssignments } from '@/lib/services/strategic-targets';
import type { PlanetCategory } from '@/lib/types/platoon-readiness';

export type PublicStrategicTarget = {
  memberName: string;
  unitName: string;
  planetCategory: PlanetCategory | null;
};

export type PublicStrategicTargetsBoard = {
  guild: {
    name: string;
    slug: string;
  };
  isFixture: boolean;
  lastUpdatedAt: string | null;
  targets: PublicStrategicTarget[];
};

type PublicStrategicTargetRow = {
  player_name: string;
  unit_name: string;
  planet_category: PlanetCategory | null;
  updated_at: string;
};

type PublicStrategicTargetMemberRow = {
  id: string;
  player_name: string;
};

type PublicStrategicTargetReferenceUnitRow = {
  unit_base_id: string;
  unit_name: string | null;
};

type PublicStrategicTargetRosterUnitRow = {
  guild_member_id: string;
  unit_base_id: string;
  unit_name: string;
};

function getLatestUpdatedAt(values: string[]): string | null {
  if (values.length === 0) {
    return null;
  }

  return [...values].sort((left, right) => right.localeCompare(left))[0] ?? null;
}

function getFixtureBoard(slug: string): PublicStrategicTargetsBoard | null {
  const dataset = getDemoPlatoonReadinessDataset();
  const fixtureSlug = dataset.guild?.slug ?? 'demo';

  if (slug !== fixtureSlug && slug !== 'demo') {
    return null;
  }

  const membersById = new Map(dataset.members.map((member) => [member.memberId, member]));
  const unitNames = new Map<string, string>();

  for (const slot of dataset.slots) {
    if (!unitNames.has(slot.unitBaseId)) {
      unitNames.set(slot.unitBaseId, slot.unitName ?? slot.unitBaseId);
    }
  }

  for (const entry of dataset.roster) {
    if (!unitNames.has(entry.unitBaseId)) {
      unitNames.set(entry.unitBaseId, entry.unitName);
    }
  }

  const targets = dataset.strategicAssignments
    .map((assignment) => {
      const member = membersById.get(assignment.guildMemberId);
      if (!member) {
        return null;
      }

      return {
        memberName: member.playerName,
        unitName: unitNames.get(assignment.unitBaseId) ?? assignment.unitBaseId,
        planetCategory: assignment.planetCategory,
        updatedAt: assignment.updatedAt,
      };
    })
    .filter((target): target is NonNullable<typeof target> => target !== null)
    .sort((left, right) => {
      if (left.memberName !== right.memberName) {
        return left.memberName.localeCompare(right.memberName);
      }

      return left.unitName.localeCompare(right.unitName);
    });

  return {
    guild: {
      name: dataset.guild?.name ?? 'Demo Guild',
      slug: fixtureSlug,
    },
    isFixture: true,
    lastUpdatedAt: getLatestUpdatedAt(targets.map((target) => target.updatedAt)),
    targets: targets.map((target) => ({
      memberName: target.memberName,
      unitName: target.unitName,
      planetCategory: target.planetCategory,
    })),
  };
}

async function getLiveBoard(slug: string): Promise<PublicStrategicTargetsBoard | null> {
  const guildResult = await sql<{ id: string; name: string; slug: string }>`
    SELECT id, name, slug
    FROM guilds
    WHERE slug = ${slug}
    LIMIT 1
  `;

  const guild = guildResult.rows[0];
  if (!guild) {
    return null;
  }

  const assignments = await listGuildUpgradeAssignments(guild.id);
  if (assignments.length === 0) {
    return {
      guild: {
        name: guild.name,
        slug: guild.slug,
      },
      isFixture: false,
      lastUpdatedAt: null,
      targets: [],
    };
  }

  const memberIds = [...new Set(assignments.map((assignment) => assignment.guildMemberId))];
  const unitBaseIds = [...new Set(assignments.map((assignment) => assignment.unitBaseId))];

  const [memberResult, referenceUnitResult, rosterUnitResult] = await Promise.all([
    sql.query<PublicStrategicTargetMemberRow>(
      `
        SELECT id, player_name
        FROM guild_members
        WHERE guild_id = $1
          AND id = ANY($2::uuid[])
      `,
      [guild.id, memberIds]
    ),
    sql.query<PublicStrategicTargetReferenceUnitRow>(
      `
        SELECT DISTINCT ON (tps.unit_base_id)
          tps.unit_base_id,
          tps.unit_name
        FROM tb_definitions td
        JOIN tb_phases tp ON tp.tb_definition_id = td.id
        JOIN tb_zones tz ON tz.tb_phase_id = tp.id
        JOIN tb_platoons tpl ON tpl.tb_zone_id = tz.id
        JOIN tb_platoon_slots tps ON tps.tb_platoon_id = tpl.id
        WHERE td.is_active = true
          AND tps.unit_base_id = ANY($1::text[])
        ORDER BY
          tps.unit_base_id ASC,
          td.updated_at DESC,
          td.created_at DESC,
          tps.updated_at DESC
      `,
      [unitBaseIds]
    ),
    sql.query<PublicStrategicTargetRosterUnitRow>(
      `
        SELECT DISTINCT ON (gm.id, rc.unit_base_id)
          gm.id AS guild_member_id,
          rc.unit_base_id,
          rc.unit_name
        FROM roster_cache rc
        JOIN guild_members gm
          ON gm.ally_code = rc.ally_code
         AND gm.guild_id = rc.guild_id
        WHERE rc.guild_id = $1
          AND gm.id = ANY($2::uuid[])
          AND rc.unit_base_id = ANY($3::text[])
        ORDER BY gm.id ASC, rc.unit_base_id ASC, rc.last_updated DESC
      `,
      [guild.id, memberIds, unitBaseIds]
    ),
  ]);

  const membersById = new Map(memberResult.rows.map((row) => [row.id, row.player_name]));
  const referenceUnitNames = new Map(
    referenceUnitResult.rows
      .filter((row): row is PublicStrategicTargetReferenceUnitRow & { unit_name: string } => !!row.unit_name)
      .map((row) => [row.unit_base_id, row.unit_name])
  );
  const rosterUnitNames = new Map(
    rosterUnitResult.rows.map((row) => [`${row.guild_member_id}:${row.unit_base_id}`, row.unit_name])
  );

  const targets = assignments
    .map<PublicStrategicTargetRow | null>((assignment) => {
      const memberName = membersById.get(assignment.guildMemberId);
      if (!memberName) {
        return null;
      }

      return {
        player_name: memberName,
        unit_name:
          referenceUnitNames.get(assignment.unitBaseId) ??
          rosterUnitNames.get(`${assignment.guildMemberId}:${assignment.unitBaseId}`) ??
          assignment.unitBaseId,
        planet_category: assignment.planetCategory,
        updated_at: assignment.updatedAt,
      };
    })
    .filter((row): row is PublicStrategicTargetRow => row !== null)
    .sort((left, right) => {
      if (left.player_name !== right.player_name) {
        return left.player_name.localeCompare(right.player_name);
      }

      return left.unit_name.localeCompare(right.unit_name);
    });

  return {
    guild: {
      name: guild.name,
      slug: guild.slug,
    },
    isFixture: false,
    lastUpdatedAt: getLatestUpdatedAt(targets.map((row) => row.updated_at)),
    targets: targets.map((row) => ({
      memberName: row.player_name,
      unitName: row.unit_name,
      planetCategory: row.planet_category,
    })),
  };
}

export async function getPublicStrategicTargetsBoard(
  slug: string
): Promise<PublicStrategicTargetsBoard | null> {
  const fixtureBoard = getFixtureBoard(slug);
  if (fixtureBoard) {
    return fixtureBoard;
  }

  return getLiveBoard(slug);
}
