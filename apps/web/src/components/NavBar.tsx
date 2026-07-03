'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth';

export default function NavBar() {
  const { user, logout, isLoading } = useAuth();

  return (
    <nav className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shadow-sm">
      <Link href="/" className="font-bold text-xl tracking-tight text-blue-700 flex items-center gap-2">
        <span className="bg-blue-600 text-white w-8 h-8 rounded-lg flex items-center justify-center shadow-sm">R</span>
        Research Workbench
      </Link>
      <div className="flex items-center gap-4">
        {!isLoading && user ? (
          <>
            <Link href="/projects" className="text-gray-600 hover:text-blue-700 font-medium transition-colors">Projects</Link>
            <Link href="/settings/models" className="text-gray-600 hover:text-blue-700 font-medium transition-colors">Models</Link>
            <Link href="/settings/search-provider" className="text-gray-600 hover:text-blue-700 font-medium transition-colors">Search</Link>
            <Link href="/settings/prompts" className="text-gray-600 hover:text-blue-700 font-medium transition-colors">Prompts</Link>
            <span className="text-sm text-gray-400">{user.email}</span>
            <button
              onClick={logout}
              className="text-sm text-gray-500 hover:text-red-600 transition-colors font-medium"
            >
              Logout
            </button>
          </>
        ) : (
          !isLoading && (
            <Link href="/login" className="text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors">
              Sign In
            </Link>
          )
        )}
      </div>
    </nav>
  );
}
