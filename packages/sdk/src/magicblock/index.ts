/**
 * magicblock Ephemeral Rollup SDK
 * 
 * Provides utilities for:
 * - Delegating accounts to ER
 * - Routing transactions via Magic Router
 * - Committing state from ER to base layer
 * - Managing batch settlement lifecycle
 */

export * from './config';
export * from './router';

// Re-export commonly used items
export {
  MAGIC_ENDPOINTS,
  ER_VALIDATORS,
  DELEGATION_PROGRAM_ID,
  getERConfig,
  DEFAULT_ER_CONFIG,
  type ERConfig,
} from './config';

export {
  MagicConnection,
  createDelegateInstruction,
  createCommitInstruction,
} from './router';
