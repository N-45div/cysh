import { z } from 'zod';

const EnvSchema = z.object({
  // Solana
  SOLANA_RPC_URL: z.string().min(1, 'SOLANA_RPC_URL is required'),
  SOLANA_WALLET_PATH: z.string().optional(),

  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),


  // magicblock
  MAGIC_ROUTER_URL: z.string().optional(),
  ER_DEVNET_URL: z.string().optional(),
  TEE_ER_URL: z.string().optional(),
  MAGICBLOCK_SESSION_KEY: z.string().optional(),
  MAGICBLOCK_BATCH_INTERVAL: z.string().optional(),

  // Monitoring & Security
  LOG_LEVEL: z.string().default('info'),
  SENTRY_DSN: z.string().optional(),
  DATADOG_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(): Env {
  return EnvSchema.parse(process.env);
}

export const env = loadEnv();
