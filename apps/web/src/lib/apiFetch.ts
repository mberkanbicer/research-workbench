/**
 * Base URL for the API server.
 * Configure via NEXT_PUBLIC_API_URL env var (default: http://localhost:4000).
 */
export const API_BASE: string = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * API fetch wrapper — reads the auth token from localStorage and attaches
 * it as an Authorization header. Drop-in replacement for native `fetch`.
 */
export function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
  const headers = new Headers(init?.headers);

  // Don't override Content-Type if the caller already set it
  if (!headers.has('Content-Type') && init?.body && typeof init.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(input, { ...init, headers });
}
