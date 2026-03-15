  import { notFound } from 'next/navigation';
  import { computePlatoonMatching } from '@/lib/services/platoon-matching';
  import { loadStrategicPlannerDatasetForGuildSlug } from '@/lib/services/platoon-readiness';
  import PublicGuildMatchingBoard from './PublicGuildMatchingBoard';

  export const revalidate = 300;

  type PageProps = {
    params: Promise<{ slug: string }>;
  };

  export default async function PublicGuildMatchingPage({ params }: PageProps) {
    const { slug } = await params;

    const dataset = await loadStrategicPlannerDatasetForGuildSlug(slug);

    if (!dataset.guild || !dataset.reference) {
      notFound();
    }

    const matching = computePlatoonMatching(dataset);

    return (
      <PublicGuildMatchingBoard
        slug={slug}
        guildName={dataset.guild.name ?? slug}
        tbKey={dataset.reference.tbKey}
        matching={matching}
      />
    );
  }