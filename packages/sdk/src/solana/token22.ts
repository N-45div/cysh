/**
 * Token-2022 Helpers
 * 
 * Provides utilities for:
 * - Creating Token-2022 mints
 * - Managing token accounts (ATAs)
 * - Token operations (mint, transfer, burn)
 * 
 * Note: Confidential transfers removed - privacy comes from:
 * - Arcium MXE (encrypted order matching)
 * - Magicblock ER (batched settlement)
 * - Stealth addresses (future enhancement)
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  createInitializeMintInstruction,
  createInitializeAccountInstruction,
  getMintLen,
  getAccountLen,
  ExtensionType,
} from '@solana/spl-token';

/**
 * Configuration for Token-2022 mint
 */
export interface Token22MintConfig {
  decimals: number;
  authority: PublicKey;
  freezeAuthority?: PublicKey;
}

/**
 * Create a new Token-2022 mint (basic, no extensions)
 */
export async function createToken22Mint(
  connection: Connection,
  payer: Keypair,
  config: Token22MintConfig
): Promise<PublicKey> {
  const mintKeypair = Keypair.generate();
  const mint = mintKeypair.publicKey;

  // Calculate space for basic mint (no extensions)
  const mintLen = getMintLen([]);

  // Calculate rent
  const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);

  const transaction = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mint,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeMintInstruction(
      mint,
      config.decimals,
      config.authority,
      config.freezeAuthority || null,
      TOKEN_2022_PROGRAM_ID
    )
  );

  await sendAndConfirmTransaction(connection, transaction, [payer, mintKeypair]);

  return mint;
}

/**
 * Create a Token-2022 account for a user
 */
export async function createToken22Account(
  connection: Connection,
  payer: Keypair,
  mint: PublicKey,
  owner: PublicKey
): Promise<PublicKey> {
  const accountKeypair = Keypair.generate();
  const account = accountKeypair.publicKey;

  // Calculate space for basic account (no extensions)
  const accountLen = getAccountLen([]);

  // Calculate rent
  const lamports = await connection.getMinimumBalanceForRentExemption(accountLen);

  const transaction = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: account,
      space: accountLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeAccountInstruction(
      account,
      mint,
      owner,
      TOKEN_2022_PROGRAM_ID
    )
  );

  await sendAndConfirmTransaction(connection, transaction, [payer, accountKeypair]);

  return account;
}

/**
 * Re-export Token-2022 program ID for convenience
 */
export { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';

/**
 * Helper to get Token-2022 account info
 */
export async function getToken22AccountInfo(
  connection: Connection,
  account: PublicKey
) {
  const accountInfo = await connection.getAccountInfo(account);
  if (!accountInfo) {
    throw new Error('Account not found');
  }

  // Basic account info - use @solana/spl-token for full parsing
  return {
    address: account,
    data: accountInfo.data,
    owner: accountInfo.owner,
  };
}
