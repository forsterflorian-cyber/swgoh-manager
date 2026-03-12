import { NextRequest } from 'next/server';

import { jsonError, jsonOk } from '@/lib/api/responses';
import { importTerritoryBattleReferenceData } from '@/lib/reference-data/tb-import';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ImportBody = {
  tb: 'rote';
  force: boolean;
};

function getProvidedSecret(request: NextRequest) {
  const authorizationHeader = request.headers.get('authorization');
  const bearerSecret = authorizationHeader?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();

  return bearerSecret || request.headers.get('x-admin-secret')?.trim() || null;
}

async function parseImportBody(request: NextRequest): Promise<ImportBody> {
  const rawBody = await request.text();

  if (!rawBody.trim()) {
    return {
      tb: 'rote',
      force: false,
    };
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    throw new Error('Request body must be valid JSON');
  }

  if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
    throw new Error('Request body must be a JSON object');
  }

  const body = parsedBody as Record<string, unknown>;
  const tbValue = body.tb;
  const forceValue = body.force;

  if (tbValue !== undefined && tbValue !== 'rote') {
    throw new Error('Unsupported tb key');
  }

  if (forceValue !== undefined && typeof forceValue !== 'boolean') {
    throw new Error('The "force" field must be a boolean');
  }

  return {
    tb: 'rote',
    force: forceValue === true,
  };
}

export async function GET() {
  return jsonError('Use POST with admin authentication to trigger the TB reference import.', 405);
}

export async function POST(request: NextRequest) {
  const expectedSecret = process.env.TB_IMPORT_ADMIN_SECRET?.trim();
  if (!expectedSecret) {
    return jsonError('TB_IMPORT_ADMIN_SECRET is not configured', 500);
  }

  const providedSecret = getProvidedSecret(request);
  if (!providedSecret || providedSecret !== expectedSecret) {
    return jsonError('Unauthorized', 401);
  }

  let body: ImportBody;
  try {
    body = await parseImportBody(request);
  } catch (error: unknown) {
    return jsonError(
      error instanceof Error ? error.message : 'Request body could not be parsed',
      400
    );
  }

  try {
    const result = await importTerritoryBattleReferenceData(body.tb, {
      force: body.force,
    });

    return jsonOk({
      tb: result.tbKey,
      tbName: result.tbName,
      imported: !result.skipped,
      skipped: result.skipped,
      force: result.forced,
      sourceVersion: result.sourceVersion,
      sourceVersions: result.sourceVersions,
      counts: result.counts,
      completedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    console.error('[tb-import-admin] reference import failed', {
      tb: body.tb,
      force: body.force,
      error,
    });

    return jsonError('Reference data import failed. Check server logs for details.', 502);
  }
}
