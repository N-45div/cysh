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

// Solana Attestation Service (KYC)
export * as sas from './sas';

// Re-export key types and classes for convenience
export type { Order, MatchResult, ArciumConfig } from './arcium';
export { ArciumClient } from './arcium';
export type { ERConfig } from './magicblock';
export { MagicConnection } from './magicblock';
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
