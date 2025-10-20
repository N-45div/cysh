/**
 * magicblock Router SDK Wrapper
 * 
 * Wraps ConnectionMagicRouter and sendMagicTransaction for transparent
 * routing of transactions to ER or base layer
 */

import {
  Connection,
  Transaction,
  TransactionInstruction,
  PublicKey,
  Signer,
  SendOptions,
  ConfirmOptions,
  Commitment,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { ConnectionMagicRouter } from '@magicblock-labs/ephemeral-rollups-sdk';
import { ERConfig, DEFAULT_ER_CONFIG } from './config';
import { erMetrics, measureLatency } from '../metrics/metrics';

/**
 * Enhanced connection that routes transactions to ER or base layer
 */
export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 500,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
};

export class MagicConnection {
  private routerConnection: ConnectionMagicRouter;
  private erConnection: Connection;
  private solanaConnection: Connection;
  public config: ERConfig;
  public retryConfig: RetryConfig;

  constructor(config: ERConfig = DEFAULT_ER_CONFIG, retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG) {
    this.config = config;
    this.retryConfig = retryConfig;
    this.routerConnection = new ConnectionMagicRouter(
      config.routerUrl,
      { wsEndpoint: config.routerWsUrl }
    );
    this.erConnection = new Connection(config.erUrl, 'confirmed');
    this.solanaConnection = new Connection(config.solanaUrl, 'confirmed');
  }

  /**
   * Send transaction via Magic Router with retry logic
   * Router automatically determines if tx should go to ER or base layer
   */
  async sendMagicTransaction(
    transaction: Transaction,
    signers: Signer[],
    options: ConfirmOptions = { skipPreflight: true, commitment: 'confirmed' }
  ): Promise<string> {
    return await this.withRetry(async () => {
      return await sendAndConfirmTransaction(
        this.routerConnection,
        transaction,
        signers,
        options
      );
    }, 'sendMagicTransaction');
  }

  /**
   * Retry wrapper with exponential backoff and error tracking
   */
  private async withRetry<T>(
    fn: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    let lastError: Error | undefined;
    let delay = this.retryConfig.initialDelayMs;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        erMetrics.recordError(operationName, lastError.message);
        
        if (attempt === this.retryConfig.maxRetries) {
          console.error(`${operationName} failed after ${attempt + 1} attempts:`, lastError.message);
          throw lastError;
        }

        console.warn(`${operationName} attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        
        delay = Math.min(delay * this.retryConfig.backoffMultiplier, this.retryConfig.maxDelayMs);
      }
    }

    throw lastError!;
  }

  /**
   * Send transaction directly to ER (bypassing router)
   */
  async sendToER(
    transaction: Transaction,
    signers: Signer[],
    options?: SendOptions
  ): Promise<string> {
    const { blockhash } = await this.erConnection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = signers[0].publicKey;
    
    transaction.sign(...signers);
    
    return await this.erConnection.sendRawTransaction(
      transaction.serialize(),
      options
    );
  }

  /**
   * Send transaction directly to base layer (bypassing router)
   */
  async sendToBaseLayer(
    transaction: Transaction,
    signers: Signer[],
    options?: SendOptions
  ): Promise<string> {
    const { blockhash } = await this.solanaConnection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = signers[0].publicKey;
    
    transaction.sign(...signers);
    
    return await this.solanaConnection.sendRawTransaction(
      transaction.serialize(),
      options
    );
  }

  /**
   * Confirm transaction on appropriate endpoint
   */
  async confirmTransaction(
    signature: string,
    commitment: Commitment = 'confirmed',
    useER: boolean = false
  ): Promise<void> {
    const connection = useER ? this.erConnection : this.solanaConnection;
    
    const confirmation = await connection.confirmTransaction(signature, commitment);
    
    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }
  }

  /**
   * Get account info from ER
   */
  async getAccountInfoFromER(pubkey: PublicKey) {
    return await this.erConnection.getAccountInfo(pubkey);
  }

  /**
   * Get account info from base layer
   */
  async getAccountInfoFromBaseLayer(pubkey: PublicKey) {
    return await this.solanaConnection.getAccountInfo(pubkey);
  }

  /**
   * Health check for all endpoints
   */
  async healthCheck(): Promise<{
    router: boolean;
    er: boolean;
    solana: boolean;
  }> {
    const checks = await Promise.allSettled([
      this.routerConnection.getSlot(),
      this.erConnection.getSlot(),
      this.solanaConnection.getSlot(),
    ]);

    return {
      router: checks[0].status === 'fulfilled',
      er: checks[1].status === 'fulfilled',
      solana: checks[2].status === 'fulfilled',
    };
  }
}

/**
 * Helper to create delegate instruction
 */
export function createDelegateInstruction(
  programId: PublicKey,
  accounts: {
    payer: PublicKey;
    pda: PublicKey;
    validator?: PublicKey;
  },
  batchId: number
): TransactionInstruction {
  // This will be generated from the Anchor IDL
  // Placeholder implementation
  return new TransactionInstruction({
    keys: [
      { pubkey: accounts.payer, isSigner: true, isWritable: true },
      { pubkey: accounts.pda, isSigner: false, isWritable: true },
      ...(accounts.validator
        ? [{ pubkey: accounts.validator, isSigner: false, isWritable: false }]
        : []),
    ],
    programId,
    data: Buffer.from([]), // TODO: Add proper instruction data
  });
}

/**
 * Helper to create commit instruction
 */
export function createCommitInstruction(
  programId: PublicKey,
  accounts: {
    payer: PublicKey;
    batchEscrow: PublicKey;
    magicContext: PublicKey;
    magicProgram: PublicKey;
  }
): TransactionInstruction {
  return new TransactionInstruction({
    keys: [
      { pubkey: accounts.payer, isSigner: true, isWritable: true },
      { pubkey: accounts.batchEscrow, isSigner: false, isWritable: true },
      { pubkey: accounts.magicContext, isSigner: false, isWritable: false },
      { pubkey: accounts.magicProgram, isSigner: false, isWritable: false },
    ],
    programId,
    data: Buffer.from([]), // TODO: Add proper instruction data
  });
}
