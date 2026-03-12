'use client';

import { signOut } from 'next-auth/react';

export function LogoutButton() {
  return (
    <button
      onClick={() => void signOut({ callbackUrl: '/' })}
      className="rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm font-medium text-red-200 transition-colors hover:bg-red-950/70 hover:text-red-100"
    >
      Logout
    </button>
  );
}
