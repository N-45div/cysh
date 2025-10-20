/**
 * magicblock Ephemeral Rollup Configuration
 * 
 * Centralized endpoints and validator IDs for ER integration
 */

import { PublicKey } from '@solana/web3.js';

// ========== Endpoints ==========

export const MAGIC_ENDPOINTS = {
  // Magic Router (routes txs to ER or L1)
  ROUTER_DEVNET: 'https://devnet-router.magicblock.app',
  ROUTER_WS_DEVNET: 'wss://devnet-router.magicblock.app',
  
  // Ephemeral Rollup endpoints
  ER_DEVNET: 'https://devnet.magicblock.app',
  ER_TEE_DEVNET: 'https://tee-devnet.magicblock.app', // TEE-enabled ER
  
  // Solana base layer
  SOLANA_DEVNET: 'https://api.devnet.solana.com',
  
  // Local development
  ER_LOCAL: 'http://127.0.0.1:8899',
  ROUTER_WS_LOCAL: 'ws://127.0.0.1:8900',
} as const;

// ========== ER Validator Public Keys ==========

/**
 * Ephemeral Rollup validator public keys for delegation
 * These validators run the ER and process delegated accounts
 */
export const ER_VALIDATORS = {
  // Devnet validators
  ASIA_DEVNET: new PublicKey('MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57'),
  EU_DEVNET: new PublicKey('MEUGGrYPxKk17hCr7wpT6s8dtNokZj5U2L57vjYMS8e'),
  US_DEVNET: new PublicKey('MUS3hc9TCw4cGC12vHNoYcCGzJG1txjgQLZWVoeNHNd'),
  TEE_DEVNET: new PublicKey('FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA'),
  
  // Local development
  LOCAL: new PublicKey('mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev'),
} as const;

// ========== Delegation Program ==========

/**
 * Delegation program that manages account ownership transfer to ER
 */
export const DELEGATION_PROGRAM_ID = new PublicKey(
  'DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh'
);

// ========== Configuration Helpers ==========

export interface ERConfig {
  routerUrl: string;
  routerWsUrl: string;
  erUrl: string;
  solanaUrl: string;
  validator: PublicKey;
  useTEE?: boolean;
}

/**
 * Get ER configuration for a specific environment
 */
export function getERConfig(env: 'devnet' | 'local', region?: 'asia' | 'eu' | 'us' | 'tee'): ERConfig {
  if (env === 'local') {
    return {
      routerUrl: MAGIC_ENDPOINTS.ER_LOCAL,
      routerWsUrl: MAGIC_ENDPOINTS.ROUTER_WS_LOCAL,
      erUrl: MAGIC_ENDPOINTS.ER_LOCAL,
      solanaUrl: MAGIC_ENDPOINTS.ER_LOCAL,
      validator: ER_VALIDATORS.LOCAL,
    };
  }
  
  // Devnet configuration
  const validatorMap = {
    asia: ER_VALIDATORS.ASIA_DEVNET,
    eu: ER_VALIDATORS.EU_DEVNET,
    us: ER_VALIDATORS.US_DEVNET,
    tee: ER_VALIDATORS.TEE_DEVNET,
  };
  
  const validator = region ? validatorMap[region] : ER_VALIDATORS.US_DEVNET;
  const useTEE = region === 'tee';
  
  return {
    routerUrl: MAGIC_ENDPOINTS.ROUTER_DEVNET,
    routerWsUrl: MAGIC_ENDPOINTS.ROUTER_WS_DEVNET,
    erUrl: useTEE ? MAGIC_ENDPOINTS.ER_TEE_DEVNET : MAGIC_ENDPOINTS.ER_DEVNET,
    solanaUrl: MAGIC_ENDPOINTS.SOLANA_DEVNET,
    validator,
    useTEE,
  };
}

/**
 * Default ER configuration (devnet, US region)
 */
export const DEFAULT_ER_CONFIG = getERConfig('devnet', 'us');
