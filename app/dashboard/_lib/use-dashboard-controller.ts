'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  fetchDashboard,
  fetchMemberRegistration,
  getNoticeFromSearchParams,
  getRosterState,
  syncGuildRoster,
} from './dashboard-client';
import type {
  DashboardGuild,
  DashboardStrategicReadiness,
  DashboardTb,
  MemberRegistration,
  Notice,
  SyncStatus,
} from './types';

function applyDashboardData(args: {
  dashboard: {
    guild: DashboardGuild | null;
    activeTb: DashboardTb | null;
    lastRosterSync: string | null;
    strategicReadiness: DashboardStrategicReadiness | null;
    permissions: {
      canManageGuild: boolean;
    };
  };
  setGuild: (guild: DashboardGuild | null) => void;
  setActiveTb: (tb: DashboardTb | null) => void;
  setLastRosterSync: (value: string | null) => void;
  setStrategicReadiness: (value: DashboardStrategicReadiness | null) => void;
  setCanManageGuild: (value: boolean) => void;
}) {
  const { dashboard, setGuild, setActiveTb, setLastRosterSync, setStrategicReadiness, setCanManageGuild } = args;
  setGuild(dashboard.guild);
  setActiveTb(dashboard.activeTb);
  setLastRosterSync(dashboard.lastRosterSync);
  setStrategicReadiness(dashboard.strategicReadiness);
  setCanManageGuild(dashboard.permissions.canManageGuild);
}

export function useDashboardController() {
  const [guild, setGuild] = useState<DashboardGuild | null>(null);
  const [activeTb, setActiveTb] = useState<DashboardTb | null>(null);
  const [lastRosterSync, setLastRosterSync] = useState<string | null>(null);
  const [strategicReadiness, setStrategicReadiness] = useState<DashboardStrategicReadiness | null>(null);
  const [canManageGuild, setCanManageGuild] = useState(false);
  const [memberRegistration, setMemberRegistration] = useState<MemberRegistration | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const dashboard = await fetchDashboard();
        applyDashboardData({
          dashboard,
          setGuild,
          setActiveTb,
          setLastRosterSync,
          setStrategicReadiness,
          setCanManageGuild,
        });
        setError(null);

        if (!dashboard.guild) {
          try {
            const registration = await fetchMemberRegistration();
            setMemberRegistration(registration);
          } catch {
            setMemberRegistration(null);
          }
        }
      } catch (loadError: unknown) {
        setError(loadError instanceof Error ? loadError.message : 'Dashboard could not be loaded');
      } finally {
        setLoading(false);
      }
    }

    void loadDashboard();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    setNotice(getNoticeFromSearchParams(window.location.search));
  }, []);

  const rosterState = useMemo(
    () => getRosterState(guild?.memberCount ?? 0, guild?.rosteredMembers ?? 0, lastRosterSync),
    [guild?.memberCount, guild?.rosteredMembers, lastRosterSync],
  );

  const noGuildConnected = !guild;
  const rosterCoveragePercent = strategicReadiness?.dataState
    ? Math.round(strategicReadiness.dataState.rosterCoverageRatio * 100)
    : 0;

  const refreshDashboard = async () => {
    const dashboard = await fetchDashboard();
    applyDashboardData({
      dashboard,
      setGuild,
      setActiveTb,
      setLastRosterSync,
      setStrategicReadiness,
      setCanManageGuild,
    });
  };

  const handleSync = async () => {
    if (!guild?.id || syncing) {
      return;
    }

    setSyncing(true);
    setError(null);
    setNotice(null);

    try {
      await syncGuildRoster(guild.id, setSyncStatus);
      await refreshDashboard();
      setNotice({
        tone: 'success',
        message: 'Roster sync completed successfully.',
      });
      window.setTimeout(() => setSyncStatus(null), 2500);
    } catch (syncError: unknown) {
      const message = syncError instanceof Error ? syncError.message : 'Roster synchronization failed.';
      setNotice({ tone: 'error', message });
      setSyncStatus(null);
    } finally {
      setSyncing(false);
    }
  };

  return {
    guild,
    activeTb,
    lastRosterSync,
    strategicReadiness,
    canManageGuild,
    memberRegistration,
    loading,
    syncing,
    error,
    notice,
    syncStatus,
    noGuildConnected,
    rosterCoveragePercent,
    rosterState,
    setError,
    handleSync,
  };
}
