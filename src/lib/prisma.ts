import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

export type {
  User,
  OrderTracking,
  AuditLog,
  KycStatus,
  OrderStatus,
  OrderType,
} from '@prisma/client';
