// ─── Configuration Constants ────────────────────────────────────────────────
// Centralized constants with environment variable overrides where appropriate.

// ─── SSE / Polling ─────────────────────────────────────────────────────────
export const SSE_INITIAL_POLL_INTERVAL_MS = parseInt(process.env.SSE_POLL_INITIAL_MS || '1000', 10);
export const SSE_MAX_POLL_INTERVAL_MS = parseInt(process.env.SSE_POLL_MAX_MS || '3000', 10);
export const SSE_HEARTBEAT_INTERVAL_MS = parseInt(process.env.SSE_HEARTBEAT_MS || '15000', 10);
export const SSE_RETRY_INTERVAL_MS = parseInt(process.env.SSE_RETRY_MS || '3000', 10);

// ─── Presence ──────────────────────────────────────────────────────────────
export const PRESENCE_ONLINE_THRESHOLD_MS = parseInt(process.env.PRESENCE_ONLINE_MS || '30000', 10);
export const PRESENCE_OFFLINE_THRESHOLD_MS = parseInt(process.env.PRESENCE_OFFLINE_MS || '60000', 10);
export const PRESENCE_POLL_INTERVAL_MS = parseInt(process.env.PRESENCE_POLL_MS || '15000', 10);

// ─── Auth / Sessions ───────────────────────────────────────────────────────
export const SESSION_EXPIRY_MS = parseInt(process.env.SESSION_EXPIRY_MS || String(7 * 24 * 60 * 60 * 1000), 10);

// ─── Token Budget ──────────────────────────────────────────────────────────
export const DEFAULT_TOKEN_BUDGET = parseInt(process.env.DEFAULT_TOKEN_BUDGET || '32000', 10);

// ─── Model Output Limits ───────────────────────────────────────────────────
export const MESSAGE_CONTENT_MAX_CHARS = parseInt(process.env.MESSAGE_CONTENT_MAX_CHARS || '3000', 10);
export const RESPONSE_TEXT_MAX_CHARS = parseInt(process.env.RESPONSE_TEXT_MAX_CHARS || '5000', 10);

// ─── Embedding ─────────────────────────────────────────────────────────────
export const EMBEDDING_INPUT_MAX_CHARS = parseInt(process.env.EMBEDDING_INPUT_MAX_CHARS || '8000', 10);

// ─── Stale Evidence ────────────────────────────────────────────────────────
export const DEFAULT_STALE_THRESHOLD_DAYS = parseInt(process.env.STALE_THRESHOLD_DAYS || '180', 10);
