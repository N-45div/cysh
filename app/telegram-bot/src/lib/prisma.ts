/**
 * Prisma client singleton
 */

import { PrismaClient } from '@prisma/client';
import { config } from '../config/env';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: config.app.nodeEnv === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (config.app.nodeEnv !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Export types for convenience
export type {
  User,
  OrderTracking,
  AuditLog,
  KycStatus,
  OrderStatus,
  OrderType,
} from '@prisma/client';
