'use client';

import { Component, ReactNode } from 'react';
import Link from 'next/link';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
          <div className="bg-white border border-gray-200 rounded-3xl shadow-sm p-10 max-w-md text-center">
            <div className="text-5xl mb-4">⚠</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">Something went wrong</h2>
            <p className="text-gray-500 mb-2">An unexpected error occurred while rendering this page.</p>
            {this.state.error && (
              <p className="text-xs text-red-400 bg-red-50 rounded-lg p-3 mb-6 font-mono truncate">
                {this.state.error.message}
              </p>
            )}
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => window.location.reload()}
                className="bg-blue-600 text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors"
              >
                Reload Page
              </button>
              <Link
                href="/projects"
                className="bg-gray-100 text-gray-700 px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-gray-200 transition-colors"
              >
                Back to Projects
              </Link>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
