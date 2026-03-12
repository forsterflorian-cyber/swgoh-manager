import { NextRequest } from 'next/server';

import { getAuthenticatedUser, userCanAccessGuild, userCanManageGuild } from '@/lib/api/auth';
import { jsonError, jsonOk, readJsonObject } from '@/lib/api/responses';
import {
  createGuildUpgradeAssignment,
  getGuildIdForUpgradeAssignment,
  normalizePlanetCategory,
  removeGuildUpgradeAssignment,
} from '@/lib/services/strategic-targets';
import { PlatoonReadinessService } from '@/lib/services/platoon-readiness';

export const runtime = 'nodejs';

type CreateTargetBody = {
  guildId?: unknown;
  guildMemberId?: unknown;
  unitBaseId?: unknown;
  planetCategory?: unknown;
  note?: unknown;
};

type DeleteTargetBody = {
  assignmentId?: unknown;
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fixture = searchParams.get('fixture');
    const guildId = searchParams.get('guildId')?.trim() || undefined;
    const unitBaseId = searchParams.get('unitBaseId')?.trim() || undefined;

    if (fixture === 'demo') {
      const planner = PlatoonReadinessService.analyzeFixture('demo');
      const unit = unitBaseId
        ? planner.topMissingUnits.find((item) => item.unitBaseId === unitBaseId)
        : null;

      return jsonOk({
        guildId: planner.guild?.id ?? null,
        canManageTargets: false,
        strategicTargets: planner.strategicTargets,
        candidates: unit?.bestCandidates ?? [],
      });
    }

    const user = await getAuthenticatedUser();
    if (!user) {
      return jsonError('Unauthorized', 401);
    }

    const planner = await PlatoonReadinessService.analyzeForUser(user.id, { guildId });
    const liveGuildId = planner.guild?.id;

    if (!liveGuildId) {
      return jsonError('Guild not found', 404);
    }

    if (!(await userCanAccessGuild(user.id, liveGuildId))) {
      return jsonError('Forbidden', 403);
    }

    const unit = unitBaseId
      ? planner.topMissingUnits.find((item) => item.unitBaseId === unitBaseId)
      : null;

    return jsonOk({
      guildId: liveGuildId,
      canManageTargets: planner.permissions.canManageTargets,
      strategicTargets: planner.strategicTargets,
      candidates: unit?.bestCandidates ?? [],
    });
  } catch (error: unknown) {
    return jsonError(
      error instanceof Error ? error.message : 'Strategic target lookup failed',
      500
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return jsonError('Unauthorized', 401);
    }

    const body = await readJsonObject<CreateTargetBody>(request);
    if (!body) {
      return jsonError('Request body must be a JSON object', 400);
    }

    const guildId = typeof body.guildId === 'string' ? body.guildId.trim() : '';
    const guildMemberId =
      typeof body.guildMemberId === 'string' ? body.guildMemberId.trim() : '';
    const unitBaseId = typeof body.unitBaseId === 'string' ? body.unitBaseId.trim() : '';
    const note = typeof body.note === 'string' ? body.note : null;
    const hasPlanetCategory =
      body.planetCategory === undefined ||
      body.planetCategory === null ||
      typeof body.planetCategory === 'string';
    const planetCategory =
      typeof body.planetCategory === 'string'
        ? normalizePlanetCategory(body.planetCategory)
        : null;

    if (!guildId || !guildMemberId || !unitBaseId) {
      return jsonError('guildId, guildMemberId, and unitBaseId are required', 400);
    }

    if (!hasPlanetCategory || (typeof body.planetCategory === 'string' && !planetCategory)) {
      return jsonError('planetCategory must be LS, DS, MIX, SPECIAL, or null', 400);
    }

    if (!(await userCanManageGuild(user.id, guildId))) {
      return jsonError('Forbidden', 403);
    }

    const result = await createGuildUpgradeAssignment({
      guildId,
      guildMemberId,
      unitBaseId,
      createdByUserId: user.id,
      planetCategory,
      note,
    });

    if (!result.success) {
      return jsonError(result.error, result.status);
    }

    return jsonOk({
      assigned: true,
      assignmentId: result.assignmentId,
    });
  } catch (error: unknown) {
    return jsonError(
      error instanceof Error ? error.message : 'Strategic target assignment failed',
      500
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return jsonError('Unauthorized', 401);
    }

    const body = await readJsonObject<DeleteTargetBody>(request);
    if (!body) {
      return jsonError('Request body must be a JSON object', 400);
    }

    const assignmentId = typeof body.assignmentId === 'string' ? body.assignmentId.trim() : '';
    if (!assignmentId) {
      return jsonError('assignmentId is required', 400);
    }

    const guildId = await getGuildIdForUpgradeAssignment(assignmentId);
    if (!guildId) {
      return jsonError('Strategic target not found', 404);
    }

    if (!(await userCanManageGuild(user.id, guildId))) {
      return jsonError('Forbidden', 403);
    }

    const removed = await removeGuildUpgradeAssignment(assignmentId);
    if (!removed) {
      return jsonError('Strategic target not found', 404);
    }

    return jsonOk({ removed: true });
  } catch (error: unknown) {
    return jsonError(
      error instanceof Error ? error.message : 'Strategic target removal failed',
      500
    );
  }
}
