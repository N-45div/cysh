/**
 * Wallet signature verification utilities
 */

import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

/**
 * Verify a wallet signature
 */
export function verifyWalletSignature(
  message: string,
  signatureBase58: string,
  publicKeyString: string
): boolean {
  try {
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = bs58.decode(signatureBase58);
    const publicKeyBytes = new PublicKey(publicKeyString).toBytes();

    return nacl.sign.detached.verify(
      messageBytes,
      signatureBytes,
      publicKeyBytes
    );
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

/**
 * Generate a verification message for wallet connection
 */
export function generateVerificationMessage(telegramId: number): string {
  const timestamp = Date.now();
  return `Shadow OTC Wallet Verification\n\nTelegram ID: ${telegramId}\nTimestamp: ${timestamp}\n\nSign this message to prove wallet ownership.`;
}

/**
 * Check if verification message is still valid (within 5 minutes)
 */
export function isVerificationMessageValid(message: string): boolean {
  try {
    const timestampMatch = message.match(/Timestamp: (\d+)/);
    if (!timestampMatch) return false;

    const timestamp = parseInt(timestampMatch[1]);
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;

    return (now - timestamp) < fiveMinutes;
  } catch {
    return false;
  }
}
