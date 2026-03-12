import { jsonError } from '@/lib/api/responses';

export const runtime = 'nodejs';

export async function GET() {
  return jsonError(
    'This legacy members endpoint is no longer supported. Use /api/guild/[guildId]/members instead.',
    410
  );
}
