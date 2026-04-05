'use client';

import { Navbar } from '@/components/layout/Navbar';
import { AppShell } from '@/components/layout/AppShell';

import { DashboardErrorBanner, DashboardNoticeBanner } from './_components/DashboardBanner';
import { DangerZoneSection } from './_components/DangerZoneSection';
import { DashboardEmptyState } from './_components/DashboardEmptyState';
import { DashboardSkeleton } from './_components/DashboardSkeleton';
import { DashboardUnauthorizedState } from './_components/DashboardUnauthorizedState';
import { DataStatusPanel } from './_components/DataStatusPanel';
import { GuildHeaderSection } from './_components/GuildHeaderSection';
import { GuildMetricsSection } from './_components/GuildMetricsSection';
import { PublicSurfacesPanel } from './_components/PublicSurfacesPanel';
import { useDashboardController } from './_lib/use-dashboard-controller';

export default function DashboardPage() {
  const {
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
    handleSync,
  } = useDashboardController();

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (error === 'Unauthorized') {
    return <DashboardUnauthorizedState />;
  }

  return (
    <div className="min-h-screen">
      <Navbar />

      <AppShell>
        {error ? <DashboardErrorBanner message={error} /> : null}
        {notice ? <DashboardNoticeBanner notice={notice} /> : null}

        {noGuildConnected || !guild ? (
          <DashboardEmptyState memberRegistration={memberRegistration} />
        ) : (
          <>
            <GuildHeaderSection
              guild={guild}
              activeTb={activeTb}
              canManageGuild={canManageGuild}
              syncing={syncing}
              onSync={handleSync}
            />
            <GuildMetricsSection
              guild={guild}
              rosterState={rosterState}
              rosterCoveragePercent={rosterCoveragePercent}
            />
            <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
              <DataStatusPanel
                guild={guild}
                strategicReadiness={strategicReadiness}
                lastRosterSync={lastRosterSync}
                rosterCoveragePercent={rosterCoveragePercent}
                syncStatus={syncStatus}
              />
              <PublicSurfacesPanel guild={guild} activeTb={activeTb} />
            </section>
          </>
        )}

        <DangerZoneSection noGuildConnected={noGuildConnected} />
      </AppShell>
    </div>
  );
}
