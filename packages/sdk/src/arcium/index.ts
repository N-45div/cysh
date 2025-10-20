/**
 * Arcium MXE SDK
 * 
 * Client-side encryption and MPC interaction utilities for Arcium
 */

export * from './encryption';
export * from './client';

// Re-export commonly used items
export {
  type Order,
  type MatchResult,
  type EncryptedData,
  type SharedSecret,
  type X25519KeyPair,
  generateX25519KeyPair,
  deriveSharedSecret,
  encryptOrder,
  decryptMatchResult,
  prepareEncryptedOrder,
  pubkeyToU64,
  u64ToPubkeyPartial,
} from './encryption';

export {
  ArciumClient,
  type ArciumConfig,
  type MatchOperationResult,
  DEFAULT_ARCIUM_CONFIG,
} from './client';
