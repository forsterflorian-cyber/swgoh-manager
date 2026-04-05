'use client';

import { signOut } from 'next-auth/react';

import { Button } from '@/components/ui/Button';
import { routes } from '@/lib/utils/routes';

export function LogoutButton() {
  return (
    <Button
      variant="danger"
      size="sm"
      onClick={() => void signOut({ callbackUrl: routes.home() })}
    >
      Logout
    </Button>
  );
}
