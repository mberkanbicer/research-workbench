import { DeliberationServices } from './services.js';
import {
  ModelGateway,
  ModelProviderAdapter,
  MockModelAdapter,
  OpenAICompatibleAdapter,
  OpenRouterAdapter,
  OllamaAdapter,
  SearxngSearchAdapter,
  SerpApiSearchAdapter,
  WebSearchAdapter,
  ManualEvidenceAdapter,
  MockSearchAdapter,
  SearchProviderAdapter,
  setGatewayPrisma,
} from '@repo/model-gateway';
import { GoalSeekingLoop } from './goal-seeking-loop.js';
import { MetaPromptService } from './meta-prompt.service.js';
import { PromptRegistry } from './prompt-registry.js';
import { prisma } from '../prisma.js';
import { logger } from '../utils/logger.js';

let _searchAdapter: SearchProviderAdapter | undefined | null = null;

export function buildSearchAdapter(overridesProvider?: string | null): SearchProviderAdapter | undefined {
  // Return cached instance if no provider override and already initialized
  if (!overridesProvider && _searchAdapter !== null) return _searchAdapter;

  const provider = overridesProvider || process.env.SEARCH_PROVIDER || 'mock';

  // If a per-request provider was specified, create a fresh instance (no caching)
  const shouldCache = !overridesProvider;

  switch (provider) {
    case 'mock':
      if (shouldCache) {
        _searchAdapter = new MockSearchAdapter();
        logger.info('Search adapter initialized', { provider });
        return _searchAdapter;
      }
      return new MockSearchAdapter();
    case 'searxng':
      if (shouldCache) {
        _searchAdapter = new SearxngSearchAdapter(
          process.env.SEARXNG_BASE_URL || 'https://search.bicers.me'
        );
        logger.info('Search adapter initialized', { provider });
        return _searchAdapter;
      }
      return new SearxngSearchAdapter(
        process.env.SEARXNG_BASE_URL || 'https://search.bicers.me'
      );
    case 'serpapi':
      return new SerpApiSearchAdapter(process.env.SERPAPI_API_KEY);
    case 'web':
      if (shouldCache) {
        _searchAdapter = new WebSearchAdapter(
          process.env.WEB_SEARCH_BASE_URL || 'https://api.serpapi.com',
          process.env.WEB_SEARCH_API_KEY
        );
        logger.info('Search adapter initialized', { provider });
        return _searchAdapter;
      }
      return new WebSearchAdapter(
        process.env.WEB_SEARCH_BASE_URL || 'https://api.serpapi.com',
        process.env.WEB_SEARCH_API_KEY
      );
    case 'manual':
      if (shouldCache) {
        _searchAdapter = new ManualEvidenceAdapter();
        logger.info('Search adapter initialized', { provider });
        return _searchAdapter;
      }
      return new ManualEvidenceAdapter();
    default:
      if (!overridesProvider) {
        _searchAdapter = undefined;
        logger.error('Unknown SEARCH_PROVIDER configured', { provider });
      }
      throw new Error(`Unknown search provider: ${provider}`);
  }
}

export function resetSearchAdapter(): void {
  _searchAdapter = null;
}

/**
 * Resolve an API key for model adapter construction.
 *
 * Priority:
 * 1. If ref is a raw key string (starts with sk- or > 20 chars), use it directly
 * 2. If ref is a UserApiKey UUID and userId is provided, look up and decrypt from DB
 * 3. If ref is an env var name, use process.env[name]
 * 4. Fall back to default env var for the provider
 */
async function resolveApiKey(ref?: string, fallbackEnvVar?: string, userId?: string): Promise<string | undefined> {
  if (!ref) {
    if (fallbackEnvVar) return process.env[fallbackEnvVar] || undefined;
    return undefined;
  }
  // UUID -> UserApiKey ID lookup (check before raw key check, since UUIDs are > 20 chars)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(ref) && userId) {
    // Dynamic import to avoid circular dependency at module load time
    const { prisma: db } = await import('../prisma.js');
    const stored = await db.userApiKey.findUnique({ where: { id: ref } });
    if (stored && stored.userId === userId) {
      const parts = stored.encryptedKey.split('.');
      if (parts.length === 3) {
        const { createDecipheriv } = await import('node:crypto');
        const { createHash } = await import('node:crypto');
        const encryptionKeyRaw = process.env.API_KEY_ENCRYPTION_KEY;
        if (!encryptionKeyRaw) {
          throw new Error('API_KEY_ENCRYPTION_KEY environment variable is required for API key decryption');
        }
        const key = createHash('sha256').update(encryptionKeyRaw).digest();
        const iv = Buffer.from(parts[1], 'hex');
        const tag = Buffer.from(parts[2], 'hex');
        const decipher = createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        let plaintext = decipher.update(parts[0], 'hex', 'utf8');
        plaintext += decipher.final('utf8');
        return plaintext;
      }
      logger.warn('Stored UserApiKey has corrupt format', { keyId: ref });
      return undefined;
    }
    // UserApiKey not found for this user — don't fall through to raw key, since
    // a UUID is not a valid API key. Return undefined.
    logger.warn('UserApiKey not found or not owned by user', { keyId: ref, userId });
    return undefined;
  }
  // Raw key string (check after UUID, since some keys could look UUID-like)
  if (ref.startsWith('sk-') || ref.length > 20) return ref;
  // Env var name
  return process.env[ref] || undefined;
}

export async function buildModelAdapter(config: { provider: string; model: string; baseUrl?: string; apiKeyRef?: string; userId?: string }): Promise<ModelGateway> {
  let adapter: ModelProviderAdapter;

  switch (config.provider) {
    case 'openrouter': {
      const key = await resolveApiKey(config.apiKeyRef, 'OPENROUTER_API_KEY', config.userId);
      if (!key) logger.warn('OPENROUTER_API_KEY not set — API calls will fail', { modelId: config.model });
      adapter = new OpenRouterAdapter(key || '', config.model);
      break;
    }
    case 'ollama': {
      const baseUrl = config.baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
      adapter = new OllamaAdapter(baseUrl, config.model);
      break;
    }
    case 'openai_compatible': {
      const baseUrl = config.baseUrl || process.env.OPENAI_COMPATIBLE_BASE_URL;
      if (!baseUrl) logger.warn('OPENAI_COMPATIBLE_BASE_URL not set — API calls will fail', { modelId: config.model });
      const apiKey = await resolveApiKey(config.apiKeyRef, 'OPENAI_COMPATIBLE_API_KEY', config.userId);
      adapter = new OpenAICompatibleAdapter(baseUrl || 'http://localhost:1234/v1', config.model, apiKey);
      break;
    }
    case 'mock': {
      adapter = new MockModelAdapter();
      break;
    }
    default:
      throw new Error(`Unknown model provider: ${config.provider}`);
  }

  return new ModelGateway(adapter, config.provider, config.model);
}

export async function buildServices(modelIds: string[], searchProvider?: string | null): Promise<{ services: DeliberationServices; goalLoop: GoalSeekingLoop }> {
  const configs = await prisma.modelConfig.findMany({
    where: { id: { in: modelIds }, isEnabled: true }
  });

  const gateways = new Map<string, ModelGateway>();
  for (const cfg of configs) {
    const gateway = await buildModelAdapter({
      provider: cfg.provider,
      model: cfg.model,
      baseUrl: cfg.baseUrl || undefined,
      apiKeyRef: cfg.apiKeyRef || undefined,
      userId: cfg.userId || undefined,
    });
    gateways.set(cfg.id, gateway);
  }

  for (const id of modelIds) {
    if (!gateways.has(id)) {
      const errorMsg = `Requested model ID ${id} not found in DB or is disabled. Cannot start run.`;
      logger.error(errorMsg);
      throw new Error(errorMsg);
    }
  }

  const searchAdapter = buildSearchAdapter(searchProvider || undefined);
  const promptRegistry = new PromptRegistry(true);
  const services = new DeliberationServices(gateways, searchAdapter, promptRegistry);

  // Wire up the model call recorder with the real Prisma client
  setGatewayPrisma(prisma);

  // Use the first available gateway for meta-prompting
  const metaGateway = gateways.values().next().value;
  const metaPromptService = metaGateway ? new MetaPromptService(metaGateway) : undefined;

  const goalLoop = new GoalSeekingLoop(services, metaPromptService);
  return { services, goalLoop };
}

// Removed: buildGoalSeekingServices — unified into buildServices above.
// GoalSeekingLoop is now the sole orchestrator for both standard and self-improving modes.
