import { jsonError } from '@/lib/api/responses';

export const runtime = 'nodejs';

export async function POST() {
  return jsonError(
    'This legacy assignment endpoint is no longer supported. Use /api/tb/[instanceId]/assign with tbPlatoonSlotId.',
    410
  );
}
