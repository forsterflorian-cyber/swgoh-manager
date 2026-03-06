// app/api/guild/[guildId]/sync/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { RosterSyncService } from '@/lib/services/roster-sync';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { checkGuildPermission } from '@/lib/services/permissions';

export async function POST(
  request: NextRequest,
  { params }: { params: { guildId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const hasPermission = await checkGuildPermission(
      session.user.id,
      params.guildId,
      ['owner', 'admin', 'officer']
    );

    if (!hasPermission) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const result = await RosterSyncService.syncGuild(params.guildId);

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}