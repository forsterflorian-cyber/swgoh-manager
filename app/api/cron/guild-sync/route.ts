import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { syncGuildRosters } from '@/lib/services/guild-roster-sync';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes max


export async function GET(request: NextRequest) {
  return handleCron(request);
}

export async function POST(request: NextRequest) {
  return handleCron(request);
}
/**
 * POST /api/cron/guild-sync
 *
 * Vercel Cron Job endpoint for automatic guild roster sync.
 * Secured via CRON_SECRET environment variable.
 *
 * Runs daily at 06:00 UTC to sync all guild rosters.
 */
async function handleCron(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('[cron/guild-sync] CRON_SECRET not configured');
    return NextResponse.json({ error: 'Cron secret not configured' }, { status: 500 });
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    console.warn('[cron/guild-sync] Unauthorized cron attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[cron/guild-sync] Starting daily guild roster sync');

  try {
    // Get all guilds with active slugs
    const guildsResult = await sql<{ id: string; name: string; slug: string }>`
      SELECT id, name, slug
      FROM guilds
      WHERE slug IS NOT NULL AND slug != ''
    `;

    const guilds = guildsResult.rows;
    console.log(`[cron/guild-sync] Found ${guilds.length} guilds to sync`);

    const results: Array<{
      guildId: string;
      guildName: string;
      success: boolean;
      membersSynced?: number;
      error?: string;
    }> = [];

    for (const guild of guilds) {
      console.log(`[cron/guild-sync] Syncing guild: ${guild.name} (${guild.id})`);

      try {
        // Sync in batches of 10 members at a time
        const BATCH_SIZE = 10;
        let offset = 0;
        let totalUpserts = 0;
        let totalMembers = 0;

        while (true) {
          const result = await syncGuildRosters(guild.id, {
            limit: BATCH_SIZE,
            offset,
          });

          totalUpserts += result.totalUpserts;
          totalMembers = result.totalEligibleMembers;
          offset += result.membersConsidered;

          if (offset >= result.totalEligibleMembers) {
            break;
          }

          // Small delay between batches to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        results.push({
          guildId: guild.id,
          guildName: guild.name,
          success: true,
          membersSynced: totalMembers,
        });

        console.log(
          `[cron/guild-sync] ✅ ${guild.name}: ${totalMembers} members, ${totalUpserts} rows upserted`
        );
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        results.push({
          guildId: guild.id,
          guildName: guild.name,
          success: false,
          error: message,
        });

        console.error(`[cron/guild-sync] ❌ ${guild.name}: ${message}`);
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    console.log(
      `[cron/guild-sync] Completed: ${successCount} succeeded, ${failCount} failed`
    );

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary: {
        totalGuilds: guilds.length,
        succeeded: successCount,
        failed: failCount,
      },
      results,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Cron job failed';
    console.error('[cron/guild-sync] Fatal error:', error);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}