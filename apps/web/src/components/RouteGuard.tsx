'use client';

import { usePathname } from 'next/navigation';
import AuthGuard from './AuthGuard';

const PUBLIC_PATHS = ['/', '/login', '/signup'];

/**
 * RouteGuard — applies AuthGuard only to protected pages.
 * Public pages (home, login, signup) bypass auth.
 */
export default function RouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublic = PUBLIC_PATHS.some(p => pathname === p);

  if (isPublic) {
    return <>{children}</>;
  }

  return <AuthGuard>{children}</AuthGuard>;
}
