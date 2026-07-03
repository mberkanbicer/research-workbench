/** Standard API envelope used across web and API routes. */
export interface ApiError {
  code?: string;
  message?: string;
}

export interface ApiResponse<T> {
  data: T;
  meta?: Record<string, unknown>;
  error?: ApiError;
}