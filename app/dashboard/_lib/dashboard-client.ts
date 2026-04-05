import { formatDateTime } from '@/lib/utils/format-date';
import type { ApiEnvelope } from '@/lib/types/api';

import type {
  DashboardData,
  GuildMemberSummary,
  MemberRegistration,
  Notice,
  RosterState,
  SyncStatus,
} from './types';

export function getRosterState(
  memberCount: number,
  rosteredMembers: number,
  lastRosterSync: string | null,
): RosterState {
  if (memberCount <= 0) {
    return {
      label: 'No guild data',
      tone: 'bad',
      detail: 'Connect a guild first.',
    };
  }

  if (rosteredMembers <= 0) {
    return {
      label: 'Roster missing',
      tone: 'bad',
      detail: 'Run the initial roster sync.',
    };
  }

  const ratio = memberCount > 0 ? rosteredMembers / memberCount : 0;

  if (ratio >= 0.95) {
    return {
      label: 'Healthy',
      tone: 'good',
      detail: `Last sync: ${formatDateTime(lastRosterSync)}`,
    };
  }

  if (ratio >= 0.7) {
    return {
      label: 'Partial',
      tone: 'warn',
      detail: `${rosteredMembers}/${memberCount} rostered · last sync ${formatDateTime(lastRosterSync)}`,
    };
  }

  return {
    label: 'Needs sync',
    tone: 'bad',
    detail: `${rosteredMembers}/${memberCount} rostered · last sync ${formatDateTime(lastRosterSync)}`,
  };
}

export function getProgressColor(percent: number): string {
  if (percent >= 95) return 'progress-fill-emerald';
  if (percent >= 70) return 'progress-fill-blue';
  if (percent >= 40) return 'progress-fill-amber';
  return 'progress-fill-rose';
}

export function getNoticeFromSearchParams(search: string): Notice | null {
  const params = new URLSearchParams(search);
  const deleted = params.get('deleted');
  const queryError = params.get('error');

  if (deleted === '1') {
    return {
      tone: 'success',
      message: 'Guild configuration was deleted. Connect a new guild to continue.',
    };
  }

  const noticeMap: Record<string, Notice> = {
    delete_failed: { tone: 'error', message: 'Guild deletion failed.' },
    forbidden: { tone: 'error', message: 'You are not allowed to delete this guild.' },
    account_deleted: { tone: 'success', message: 'Account deleted successfully.' },
    account_delete_failed: { tone: 'error', message: 'Account deletion failed.' },
    account_delete_blocked: {
      tone: 'error',
      message: 'Delete guild first before deleting your account.',
    },
  };

  return queryError ? noticeMap[queryError] ?? null : null;
}

export async function fetchDashboard(): Promise<DashboardData> {
  const res = await fetch('/api/dashboard', { cache: 'no-store' });
  const payload = (await res.json()) as ApiEnvelope<DashboardData>;

  if (!res.ok || !payload.ok) {
    throw new Error(payload.ok ? 'Dashboard could not be loaded.' : payload.error);
  }

  return payload.data;
}

export async function fetchMemberRegistration(): Promise<MemberRegistration | null> {
  const regRes = await fetch('/api/me/registration');
  const regPayload = (await regRes.json()) as ApiEnvelope<{ registration: MemberRegistration | null }>;

  if (!regPayload.ok) {
    return null;
  }

  return regPayload.data.registration;
}

async function fetchGuildMembers(guildId: string): Promise<GuildMemberSummary[]> {
  const membersRes = await fetch(`/api/guild/${guildId}/members`);
  const membersData = (await membersRes.json()) as ApiEnvelope<{
    members: GuildMemberSummary[];
  }>;

  if (!membersRes.ok || !membersData.ok) {
    throw new Error(membersData.ok ? 'Members could not be loaded.' : membersData.error);
  }

  return membersData.data.members;
}

async function initializeGuildSync(guildId: string): Promise<void> {
  const initRes = await fetch(`/api/guild/${guildId}/sync`, { method: 'POST' });
  const initData = (await initRes.json()) as ApiEnvelope<{ imported: number; total: number }>;

  if (!initRes.ok || !initData.ok) {
    throw new Error(initData.ok ? 'Guild import failed.' : initData.error);
  }
}

async function syncSingleMember(guildId: string, member: GuildMemberSummary): Promise<string> {
  const response = await fetch(`/api/guild/${guildId}/sync?allyCode=${member.ally_code}`, {
    method: 'POST',
  });
  const payload = (await response.json()) as ApiEnvelope<{ syncedUnits: number }>;

  if (!response.ok || !payload.ok) {
    throw new Error(payload.ok ? `Roster sync failed for ${member.player_name}.` : payload.error);
  }

  return member.player_name;
}

export async function syncGuildRoster(
  guildId: string,
  onStatus: (status: SyncStatus | null) => void,
): Promise<void> {
  onStatus({ current: 0, total: 0, msg: 'Initializing guild sync...' });
  await initializeGuildSync(guildId);

  const members = await fetchGuildMembers(guildId);

  if (members.length === 0) {
    throw new Error('No guild members found.');
  }

  onStatus({
    current: 0,
    total: members.length,
    msg: 'Starting roster sync...',
  });

  const batchSize = 5;
  let count = 0;
  const errors: string[] = [];

  for (let i = 0; i < members.length; i += batchSize) {
    const batch = members.slice(i, i + batchSize);

    const results = await Promise.allSettled(batch.map(async (member) => syncSingleMember(guildId, member)));

    for (const result of results) {
      count += 1;

      if (result.status === 'fulfilled') {
        onStatus({
          current: count,
          total: members.length,
          msg: `Synced ${result.value} (${count}/${members.length})`,
        });
        continue;
      }

      const errorMsg = result.reason instanceof Error ? result.reason.message : 'Unknown error';
      errors.push(errorMsg);
      onStatus({
        current: count,
        total: members.length,
        msg: `Error: ${errorMsg}`,
      });
    }

    if (errors.length > 0 && count < members.length) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  if (errors.length > 0) {
    throw new Error(`Roster sync completed with ${errors.length} error(s): ${errors[0]}`);
  }

  onStatus({
    current: members.length,
    total: members.length,
    msg: 'Roster sync completed.',
  });
}
