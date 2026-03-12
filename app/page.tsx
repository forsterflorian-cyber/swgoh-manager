import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center px-4 py-16">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-300">
              Strategic Platoon Planning
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
              Find the guild-wide platoon bottlenecks before Territory Battle starts.
            </h1>
            <p className="mt-5 max-w-2xl text-lg text-gray-400">
              SWGOH Manager now centers on one question: which characters are fundamentally
              missing across the guild for platoons? Use guild roster data plus imported TB
              reference slots to see blocked zones, missing units, and the upgrades with the
              highest strategic impact.
            </p>

            <div className="mt-8 flex flex-wrap gap-4">
              <Link
                href="/dashboard"
                className="rounded-xl border border-blue-500 bg-blue-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-500"
              >
                Open dashboard
              </Link>
              <Link
                href="/planning/platoons?fixture=demo"
                className="rounded-xl border border-gray-700 bg-gray-900 px-6 py-3 text-sm font-medium text-gray-100 transition-colors hover:border-gray-600 hover:bg-gray-800"
              >
                View demo planner
              </Link>
            </div>
          </div>

          <div className="rounded-3xl border border-gray-800 bg-gray-900/70 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
              What the app answers
            </p>
            <div className="mt-5 space-y-4">
              {[
                'Which units are the biggest platoon bottlenecks across the guild?',
                'How many platoons can the current guild roster cover?',
                'Which zones are blocked by missing ownership or missing relic levels?',
                'Which upgrades unlock the most additional platoon coverage?',
              ].map((item) => (
                <div
                  key={item}
                  className="rounded-2xl border border-gray-800 bg-gray-950/60 px-4 py-4 text-sm text-gray-200"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
