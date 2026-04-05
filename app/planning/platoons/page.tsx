import { Suspense } from 'react';

import { PlatoonPlannerClient } from './_components/PlatoonPlannerClient';
import { PlannerLoadingShell } from './_components/PlatoonPlannerViews';

export default function PlatoonReadinessPage() {
  return (
    <Suspense fallback={<PlannerLoadingShell />}>
      <PlatoonPlannerClient />
    </Suspense>
  );
}
