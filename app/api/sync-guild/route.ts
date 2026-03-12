import { jsonError } from '@/lib/api/responses';

export const runtime = 'nodejs';

export async function POST() {
  return jsonError(
    'This legacy guild sync endpoint is no longer supported. Use /api/guild/[guildId]/sync instead.',
    410
  );
}
