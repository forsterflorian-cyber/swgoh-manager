'use client';

import { LogOut } from 'lucide-react';
import { signOut } from 'next-auth/react';

import { Button } from '@/components/ui/Button';

export function LogoutButton() {
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => void signOut({ callbackUrl: '/' })}
      leftIcon={<LogOut className="h-4 w-4" />}
    >
      Logout
    </Button>
  );
}
