import { PrismaClient } from '@prisma/client';

// Pool size is controlled via DATABASE_URL connection_limit parameter:
//   postgresql://user:pass@host:port/db?connection_limit=10
// Log level adjusts based on environment
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

export default prisma;
export { prisma };
