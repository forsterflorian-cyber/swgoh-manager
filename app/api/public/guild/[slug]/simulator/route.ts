import { NextResponse } from 'next/server';
import { applySimulationActions, simulatePlatoonScenario } from '@/lib/services/platoon-simulator';
import { findSequentialFullPlatoonPlan } from '@/lib/services/platoon-completion-advisor';
import { loadStrategicPlannerDatasetForGuildSlug } from '@/lib/services/platoon-readiness';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const body = await request.json();
    const actions = Array.isArray(body.actions) ? body.actions : [];

    const dataset = await loadStrategicPlannerDatasetForGuildSlug(slug);

    if (!dataset) {
      return NextResponse.json(
        { error: 'Guild dataset not found.' },
        { status: 404 },
      );
    }

    const simulation = simulatePlatoonScenario(dataset, actions);
    const simulatedDataset = applySimulationActions(dataset, actions);
    const advisory = findSequentialFullPlatoonPlan(simulatedDataset);

    return NextResponse.json({
      simulation,
      advisory,
    });
  } catch (error) {
    console.error('Simulator API error', error);

    return NextResponse.json(
      { error: 'Failed to simulate scenario.' },
      { status: 500 },
    );
  }
}