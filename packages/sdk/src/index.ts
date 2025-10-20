/**
 * Shadow OTC Nexus SDK
 * 
 * Unified SDK for interacting with Shadow OTC platform
 */

// Arcium MXE (encrypted matching)
export * as arcium from './arcium';

// magicblock Ephemeral Rollups
export * as magicblock from './magicblock';

// Solana & Token-2022
export * as solana from './solana';

// Settlement program
export * as settlement from './settlement';

// Re-export key types for convenience
export type { Order, MatchResult, ArciumClient, ArciumConfig } from './arcium';
export type { ERConfig, MagicConnection } from './magicblock';
export type {
  Token22MintConfig,
} from './solana';
export type {
  SettlementClient,
  TradeEscrowData,
  InitEscrowParams,
  DepositParams,
  SettleParams,
} from './settlement';
