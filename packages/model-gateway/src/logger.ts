// Re-export from shared package with model-gateway package name
import { createLogger } from '@repo/shared';
export const logger = createLogger('model-gateway');
