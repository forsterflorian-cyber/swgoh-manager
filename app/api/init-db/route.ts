import { jsonError } from '@/lib/api/responses';

export const runtime = 'nodejs';

export async function GET() {
  return jsonError(
    'Database bootstrap is managed with manual SQL files in /sql. Run them in Neon instead of using this route.',
    410
  );
}
