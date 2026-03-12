import { sql } from '@vercel/postgres';

import { getDemoPlatoonReadinessDataset } from '@/lib/services/platoon-readiness-fixture';
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

  const assignmentsResult = await sql<PublicStrategicTargetRow>`
    SELECT
      gm.player_name,
      COALESCE(
        (
          SELECT tps.unit_name
          FROM tb_definitions td
          JOIN tb_phases tp ON tp.tb_definition_id = td.id
          JOIN tb_zones tz ON tz.tb_phase_id = tp.id
          JOIN tb_platoons tpl ON tpl.tb_zone_id = tz.id
          JOIN tb_platoon_slots tps ON tps.tb_platoon_id = tpl.id
          WHERE td.is_active = true
            AND tps.unit_base_id = gua.unit_base_id
          ORDER BY td.updated_at DESC, td.created_at DESC, tps.updated_at DESC
          LIMIT 1
        ),
        (
          SELECT rc.unit_name
          FROM roster_cache rc
          WHERE rc.guild_id = gua.guild_id
            AND rc.ally_code = gm.ally_code
            AND rc.unit_base_id = gua.unit_base_id
          ORDER BY rc.last_updated DESC
          LIMIT 1
        ),
        gua.unit_base_id
      ) AS unit_name,
      gua.planet_category,
      gua.updated_at::text AS updated_at
    FROM guild_upgrade_assignments gua
    JOIN guild_members gm ON gm.id = gua.guild_member_id
    WHERE gua.guild_id = ${guild.id}
    ORDER BY gm.player_name ASC, unit_name ASC
  `;

  return {
    guild: {
      name: guild.name,
      slug: guild.slug,
    },
    isFixture: false,
    lastUpdatedAt: getLatestUpdatedAt(assignmentsResult.rows.map((row) => row.updated_at)),
    targets: assignmentsResult.rows.map((row) => ({
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
