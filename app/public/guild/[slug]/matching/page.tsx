import { notFound } from 'next/navigation';

import { computePlatoonMatching } from '@/lib/services/platoon-matching';
import { loadStrategicPlannerDatasetForGuildSlug } from '@/lib/services/platoon-readiness';
import { Navbar } from '@/components/layout/Navbar';
import { getAppBaseUrl } from '@/lib/utils/base-url';
import PublicGuildMatchingBoard from './PublicGuildMatchingBoard';
import type { UpgradeRecommendationsData } from './UpgradeRecommendations';

export const revalidate = 300;

type PageProps = {
  params: Promise<{ slug: string }>;
};

async function loadInitialUpgradeData(slug: string): Promise<UpgradeRecommendationsData | null> {
  try {
    const response = await fetch(`${getAppBaseUrl()}/api/public/guild/${slug}/upgrade-recommendations`, {
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as UpgradeRecommendationsData;
  } catch {
    return null;
  }
}

export default async function PublicGuildMatchingPage({ params }: PageProps) {
  const { slug } = await params;

  const dataset = await loadStrategicPlannerDatasetForGuildSlug(slug);

  if (!dataset.guild || !dataset.reference) {
    notFound();
  }

  const matching = computePlatoonMatching(dataset);
  const initialUpgradeData = await loadInitialUpgradeData(slug);

  return (
    <>
      <Navbar />
      <PublicGuildMatchingBoard
        slug={slug}
        guildName={dataset.guild.name ?? slug}
        tbKey={dataset.reference.tbKey}
        initialUpgradeData={initialUpgradeData}
        matchingInput={{
          slots: dataset.slots,
          roster: dataset.roster,
          members: dataset.members,
        }}
        matching={matching}
      />
    </>
  );
}
