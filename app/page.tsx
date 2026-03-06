// app/page.tsx

import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white mb-4">
          ⚔️ SWGoH TB Manager
        </h1>
        <p className="text-gray-400 mb-8">
          Territory Battle Planung für deine Gilde
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/login"
            className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white 
                       rounded-lg font-medium transition-colors"
          >
            Login / Registrieren
          </Link>
          <Link
            href="/dashboard"
            className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white 
                       rounded-lg font-medium transition-colors"
          >
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}