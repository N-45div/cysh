/**
 * Environment configuration with validation
 */

import { z } from 'zod';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load .env from monorepo root
dotenv.config({ path: resolve(__dirname, '../../../../.env') });

const envSchema = z.object({
  // Telegram
  telegram: z.object({
    botToken: z.string().min(1, 'TELEGRAM_BOT_TOKEN is required'),
    webhookUrl: z.string().url().optional(),
  }),

  // Database
  database: z.object({
    url: z.string().min(1, 'DATABASE_URL is required'),
  }),

  // Solana
  solana: z.object({
    rpcUrl: z.string().url(),
    network: z.enum(['devnet', 'mainnet-beta', 'testnet', 'localnet']),
    walletPath: z.string().optional(),
  }),

  // Arcium
  arcium: z.object({
    clusterOffset: z.number().optional().default(4040404),
    programId: z.string().optional(),
  }),

  // magicblock
  magicblock: z.object({
    routerUrl: z.string().url().optional().default('https://devnet-router.magicblock.app'),
    erUrl: z.string().url().optional().default('https://devnet.magicblock.app'),
    batchInterval: z.number().optional().default(300),
  }),

  // Application
  app: z.object({
    nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
    port: z.number().optional().default(3000),
    logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  }),
});

type EnvConfig = z.infer<typeof envSchema>;

function loadConfig(): EnvConfig {
  const raw = {
    telegram: {
      botToken: process.env.TELEGRAM_BOT_TOKEN!,
      webhookUrl: process.env.TELEGRAM_WEBHOOK_URL,
    },
    database: {
      url: process.env.DATABASE_URL!,
    },
    solana: {
      rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
      network: (process.env.SOLANA_NETWORK || 'devnet') as 'devnet' | 'mainnet-beta',
      walletPath: process.env.SOLANA_WALLET_PATH,
    },
    arcium: {
      clusterOffset: parseInt(process.env.ARCIUM_CLUSTER_OFFSET || '4040404'),
      programId: process.env.ARCIUM_PROGRAM_ID,
    },
    magicblock: {
      routerUrl: process.env.MAGICBLOCK_ROUTER_URL,
      erUrl: process.env.MAGICBLOCK_ER_URL,
      batchInterval: parseInt(process.env.MAGICBLOCK_BATCH_INTERVAL || '300'),
    },
    app: {
      nodeEnv: (process.env.NODE_ENV || 'development') as 'development' | 'production',
      port: parseInt(process.env.PORT || '3000'),
      logLevel: (process.env.LOG_LEVEL || 'info') as 'info' | 'debug',
    },
  };

  try {
    return envSchema.parse(raw);
  } catch (error) {
    console.error('❌ Environment validation failed:');
    if (error instanceof z.ZodError) {
      error.errors.forEach(err => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
    }
    process.exit(1);
  }
}

export const config = loadConfig();
