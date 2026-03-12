import { NextRequest } from 'next/server';

import { jsonError, jsonOk, readJsonObject } from '@/lib/api/responses';
import { importTerritoryBattleReferenceData } from '@/lib/reference-data/tb-import';

export const runtime = 'nodejs';

type ImportBody = {
  tb?: unknown;
  force?: unknown;
};

export async function POST(request: NextRequest) {
  try {
    const expectedSecret = process.env.TB_REFERENCE_IMPORT_SECRET;
    if (!expectedSecret) {
      return jsonError('TB_REFERENCE_IMPORT_SECRET is not configured', 500);
    }

    const providedSecret =
      request.headers.get('x-tb-import-secret') ||
      request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

    if (providedSecret !== expectedSecret) {
      return jsonError('Unauthorized', 401);
    }

    const body = (await readJsonObject<ImportBody>(request)) ?? {};
    const tb = typeof body.tb === 'string' ? body.tb : undefined;
    const force = body.force === true;

    if (tb && tb !== 'rote') {
      return jsonError(`Unsupported tb key: ${tb}`, 400);
    }

    const tbKey = 'rote';
    const result = await importTerritoryBattleReferenceData(tbKey, {
      force,
    });

    return jsonOk(result);
  } catch (error: unknown) {
    return jsonError(
      error instanceof Error ? error.message : 'Reference data import failed',
      500
    );
  }
}
