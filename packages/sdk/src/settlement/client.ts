/**
 * Settlement Program SDK Client
 * Provides typed methods for interacting with the settlement program
 */

import { Program, BN, AnchorProvider, Idl } from '@coral-xyz/anchor';
import { PublicKey, Keypair, SystemProgram, Transaction } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';

// Settlement program type (will be generated from IDL)
export type Settlement = Idl;

export interface TradeEscrowData {
  matchId: BN;
  maker: PublicKey;
  taker: PublicKey;
  makerToken: PublicKey;
  takerToken: PublicKey;
  makerAmount: BN;
  takerAmount: BN;
  makerDeposited: boolean;
  takerDeposited: boolean;
  isSettled: boolean;
  bump: number;
}

export interface InitEscrowParams {
  matchId: BN;
  maker: PublicKey;
  taker: PublicKey;
  makerToken: PublicKey;
  takerToken: PublicKey;
  makerAmount: BN;
  takerAmount: BN;
}

export interface DepositParams {
  matchId: BN;
  depositor: Keypair;
  mint: PublicKey;
  amount: BN;
}

export interface SettleParams {
  matchId: BN;
  makerMint: PublicKey;
  takerMint: PublicKey;
}

export class SettlementClient {
  constructor(
    public readonly program: Program<Settlement>,
    public readonly provider: AnchorProvider
  ) {}

  /**
   * Derive trade escrow PDA for a match ID
   */
  getTradeEscrowPda(matchId: BN): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('trade_escrow'), matchId.toArrayLike(Buffer, 'le', 8)],
      this.program.programId
    );
  }

  /**
   * Derive batch escrow PDA for a batch ID
   */
  getBatchEscrowPda(batchId: BN): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('batch_escrow'), batchId.toArrayLike(Buffer, 'le', 8)],
      this.program.programId
    );
  }

  /**
   * Get associated token address for an account
   */
  getTokenAccount(mint: PublicKey, owner: PublicKey, allowOwnerOffCurve = false): PublicKey {
    return getAssociatedTokenAddressSync(
      mint,
      owner,
      allowOwnerOffCurve,
      TOKEN_2022_PROGRAM_ID
    );
  }

  /**
   * Initialize a trade escrow for a matched order
   */
  async initEscrow(params: InitEscrowParams): Promise<string> {
    const [tradeEscrowPda] = this.getTradeEscrowPda(params.matchId);

    return await this.program.methods
      .initEscrow(
        params.matchId,
        params.maker,
        params.taker,
        params.makerToken,
        params.takerToken,
        params.makerAmount,
        params.takerAmount
      )
      .accounts({
        authority: this.provider.wallet.publicKey,
        tradeEscrow: tradeEscrowPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  /**
   * Deposit tokens into escrow (maker or taker)
   */
  async deposit(params: DepositParams): Promise<string> {
    const [tradeEscrowPda] = this.getTradeEscrowPda(params.matchId);
    const depositorTokenAccount = this.getTokenAccount(params.mint, params.depositor.publicKey);
    const escrowTokenAccount = this.getTokenAccount(params.mint, tradeEscrowPda, true);

    return await this.program.methods
      .deposit(params.amount)
      .accounts({
        depositor: params.depositor.publicKey,
        tradeEscrow: tradeEscrowPda,
        mint: params.mint,
        depositorTokenAccount,
        escrowTokenAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([params.depositor])
      .rpc();
  }

  /**
   * Settle atomic swap when both parties have deposited
   */
  async settleAtomicSwap(params: SettleParams): Promise<string> {
    const [tradeEscrowPda] = this.getTradeEscrowPda(params.matchId);
    const escrow = await this.getTradeEscrow(params.matchId);

    const escrowMakerTokenAccount = this.getTokenAccount(params.makerMint, tradeEscrowPda, true);
    const escrowTakerTokenAccount = this.getTokenAccount(params.takerMint, tradeEscrowPda, true);
    const makerReceiveAccount = this.getTokenAccount(params.takerMint, escrow.maker);
    const takerReceiveAccount = this.getTokenAccount(params.makerMint, escrow.taker);

    return await this.program.methods
      .settleAtomicSwap()
      .accounts({
        authority: this.provider.wallet.publicKey,
        tradeEscrow: tradeEscrowPda,
        makerMint: params.makerMint,
        takerMint: params.takerMint,
        escrowMakerTokenAccount,
        escrowTakerTokenAccount,
        makerReceiveAccount,
        takerReceiveAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  }

  /**
   * Withdraw from escrow if trade is cancelled
   */
  async withdraw(matchId: BN, withdrawer: Keypair, mint: PublicKey): Promise<string> {
    const [tradeEscrowPda] = this.getTradeEscrowPda(matchId);
    const escrowTokenAccount = this.getTokenAccount(mint, tradeEscrowPda, true);
    const withdrawerTokenAccount = this.getTokenAccount(mint, withdrawer.publicKey);

    return await this.program.methods
      .withdraw()
      .accounts({
        withdrawer: withdrawer.publicKey,
        tradeEscrow: tradeEscrowPda,
        mint,
        escrowTokenAccount,
        withdrawerTokenAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([withdrawer])
      .rpc();
  }

  /**
   * Fetch trade escrow account data
   */
  async getTradeEscrow(matchId: BN): Promise<TradeEscrowData> {
    const [tradeEscrowPda] = this.getTradeEscrowPda(matchId);
    return await (this.program.account as any).tradeEscrow.fetch(tradeEscrowPda);
  }

  /**
   * Initialize a batch escrow for collecting matched orders
   */
  async initializeBatch(batchId: BN): Promise<string> {
    const [batchEscrowPda] = this.getBatchEscrowPda(batchId);

    return await this.program.methods
      .initializeBatch(batchId)
      .accounts({
        authority: this.provider.wallet.publicKey,
        batchEscrow: batchEscrowPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  /**
   * Add a matched order to the batch
   */
  async addToBatch(
    batchId: BN,
    tokenMint: PublicKey,
    amount: BN,
    price: BN
  ): Promise<string> {
    const [batchEscrowPda] = this.getBatchEscrowPda(batchId);

    return await this.program.methods
      .addToBatch(tokenMint, amount, price)
      .accounts({
        authority: this.provider.wallet.publicKey,
        batchEscrow: batchEscrowPda,
      })
      .rpc();
  }

  /**
   * Finalize batch and commit to mainnet
   */
  async finalizeBatch(batchId: BN): Promise<string> {
    const [batchEscrowPda] = this.getBatchEscrowPda(batchId);

    return await this.program.methods
      .finalizeBatch()
      .accounts({
        authority: this.provider.wallet.publicKey,
        batchEscrow: batchEscrowPda,
      })
      .rpc();
  }

  /**
   * Get batch escrow account data
   */
  async getBatchEscrow(batchId: BN) {
    const [batchEscrowPda] = this.getBatchEscrowPda(batchId);
    return await (this.program.account as any).batchEscrow.fetch(batchEscrowPda);
  }
}

/**
 * Create a settlement client instance
 */
export function createSettlementClient(
  program: Program<Settlement>,
  provider: AnchorProvider
): SettlementClient {
  return new SettlementClient(program, provider);
}
