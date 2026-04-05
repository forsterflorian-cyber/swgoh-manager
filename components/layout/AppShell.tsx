import { type ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

export function AppShell({
  children,
  className,
  width = '7xl',
}: {
  children: ReactNode;
  className?: string;
  width?: '6xl' | '7xl';
}) {
  const widthClass = width === '6xl' ? 'max-w-6xl' : 'max-w-7xl';

  return <main className={cn('mx-auto w-full px-4 py-8 sm:px-6', widthClass, className)}>{children}</main>;
}
