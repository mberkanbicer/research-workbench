/**
 * Vitest setup file — runs before each test file.
 *
 * Injects the createInMemoryPrisma factory into globalThis so it can be called
 * from within vi.hoisted() blocks before module imports are evaluated.
 */
import { createInMemoryPrisma } from './inmemory-prisma.js';

(globalThis as any).__createInMemoryPrisma = createInMemoryPrisma;
