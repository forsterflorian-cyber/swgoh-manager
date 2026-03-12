import { NextRequest } from 'next/server';

import { getAuthenticatedUser, userCanAccessGuild } from '@/lib/api/auth';
import { jsonError, jsonOk, readJsonObject } from '@/lib/api/responses';
import {
  deleteGuildUpgradeAssignment,
  normalizePlanetCategory,
  saveGuildUpgradeAssignment,
} from '@/lib/services/strategic-targets';
import { PlatoonReadinessService } from '@/lib/services/platoon-readiness';

export const runtime = 'nodejs';

type CreateTargetBody = {
  guildMemberId?: unknown;
  unitBaseId?: unknown;
  planetCategory?: unknown;
  note?: unknown;
};

type DeleteTargetBody = {
  assignmentId?: unknown;
};

type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

function parseRequiredString(value: unknown, fieldName: string): ParseResult<string> {
  if (typeof value !== 'string') {
    return { ok: false, error: `${fieldName} is required` };
  }

  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return { ok: false, error: `${fieldName} is required` };
  }

  return { ok: true, value: normalizedValue };
}

function parseOptionalNote(value: unknown): ParseResult<string | null> {
  if (value === undefined || value === null) {
    return { ok: true, value: null };
  }

  if (typeof value !== 'string') {
    return { ok: false, error: 'note must be a string or null' };
  }

  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return { ok: false, error: 'note must not be empty' };
  }

  return { ok: true, value: normalizedValue };
}

function parsePlanetCategory(value: unknown): ParseResult<ReturnType<typeof normalizePlanetCategory>> {
  if (value === undefined || value === null) {
    return { ok: true, value: null };
  }

  if (typeof value !== 'string') {
    return { ok: false, error: 'planetCategory must be LS, DS, MIX, SPECIAL, or null' };
  }

  const normalizedValue = normalizePlanetCategory(value);
  if (!normalizedValue) {
    return { ok: false, error: 'planetCategory must be LS, DS, MIX, SPECIAL, or null' };
  }

  return { ok: true, value: normalizedValue };
}

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
      return jsonError('Not authorized', 401);
    }

    const body = await readJsonObject<CreateTargetBody>(request);
    if (!body) {
      return jsonError('Request body must be a JSON object', 400);
    }

    const guildMemberIdResult = parseRequiredString(body.guildMemberId, 'guildMemberId');
    if (!guildMemberIdResult.ok) {
      return jsonError(guildMemberIdResult.error, 400);
    }

    const unitBaseIdResult = parseRequiredString(body.unitBaseId, 'unitBaseId');
    if (!unitBaseIdResult.ok) {
      return jsonError(unitBaseIdResult.error, 400);
    }

    const planetCategoryResult = parsePlanetCategory(body.planetCategory);
    if (!planetCategoryResult.ok) {
      return jsonError(planetCategoryResult.error, 400);
    }

    const noteResult = parseOptionalNote(body.note);
    if (!noteResult.ok) {
      return jsonError(noteResult.error, 400);
    }

    const result = await saveGuildUpgradeAssignment({
      actorUserId: user.id,
      guildMemberId: guildMemberIdResult.value,
      unitBaseId: unitBaseIdResult.value,
      planetCategory: planetCategoryResult.value,
      note: noteResult.value,
    });

    if (!result.success) {
      return jsonError(result.error, result.status);
    }

    return jsonOk({
      assigned: true,
      assignmentId: result.assignmentId,
    });
  } catch {
    return jsonError('Strategic target assignment failed', 500);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return jsonError('Not authorized', 401);
    }

    const body = await readJsonObject<DeleteTargetBody>(request);
    if (!body) {
      return jsonError('Request body must be a JSON object', 400);
    }

    const assignmentIdResult = parseRequiredString(body.assignmentId, 'assignmentId');
    if (!assignmentIdResult.ok) {
      return jsonError(assignmentIdResult.error, 400);
    }

    const result = await deleteGuildUpgradeAssignment({
      actorUserId: user.id,
      assignmentId: assignmentIdResult.value,
    });

    if (!result.success) {
      return jsonError(result.error, result.status);
    }

    return jsonOk({ removed: true });
  } catch {
    return jsonError('Strategic target removal failed', 500);
  }
}
