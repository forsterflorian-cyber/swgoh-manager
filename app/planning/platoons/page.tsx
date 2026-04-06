import PlatoonPlannerClient from './PlatoonPlannerClient';

import { getAuthenticatedUser } from '@/lib/api/auth';
import { PlatoonReadinessService } from '@/lib/services/platoon-readiness';
import type { StrategicPlannerData } from '@/lib/types/platoon-readiness';

export const runtime = 'nodejs';
export const revalidate = 0;

type PlannerViewKey = 'overview' | 'priorities' | 'targets' | 'matching';

type PageProps = {
  searchParams: Promise<{
    fixture?: string;
    view?: string;
  }>;
};

function normalizePlannerView(value: string | undefined): PlannerViewKey {
  return value === 'priorities' || value === 'targets' || value === 'matching'
    ? value
    : 'overview';
}

async function loadInitialPlannerData(
  fixture: string | null,
): Promise<{ data: StrategicPlannerData | null; error: string | null }> {
  try {
    if (fixture === 'demo') {
      return {
        data: PlatoonReadinessService.analyzeFixture('demo'),
        error: null,
      };
    }

    const user = await getAuthenticatedUser();
    if (!user) {
      return {
        data: null,
        error: 'Unauthorized',
      };
    }

    return {
      data: await PlatoonReadinessService.analyzeForUser(user.id),
      error: null,
    };
  } catch (error: unknown) {
    return {
      data: null,
      error:
        error instanceof Error ? error.message : 'Planner could not be loaded.',
    };
  }
}

export default async function PlatoonReadinessPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const fixture = resolvedSearchParams.fixture === 'demo' ? 'demo' : null;
  const initialView = normalizePlannerView(resolvedSearchParams.view);
  const { data, error } = await loadInitialPlannerData(fixture);

  return (
    <PlatoonPlannerClient
      fixture={fixture}
      initialView={initialView}
      initialData={data}
      initialError={error}
    />
  );
}
