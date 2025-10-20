/**
 * Atomic Swap Test Suite
 * Tests the trade escrow lifecycle: init → deposit → settle/withdraw
 */

import * as anchor from '@coral-xyz/anchor';
import { Program, BN } from '@coral-xyz/anchor';
import { PublicKey, Keypair } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { expect } from 'chai';
import { Settlement } from '../target/types/settlement';

describe('Atomic Swap Instructions', () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Settlement as Program<Settlement>;

  let matchId: BN;
  let tradeEscrowPda: PublicKey;
  let maker: Keypair;
  let taker: Keypair;
  let makerToken: PublicKey;
  let takerToken: PublicKey;
  let makerTokenAccount: PublicKey;
  let takerTokenAccount: PublicKey;
  let escrowMakerTokenAccount: PublicKey;
  let escrowTakerTokenAccount: PublicKey;
  const makerAmount = new BN(1000);
  const takerAmount = new BN(2000);

  before(async () => {
    // Generate test keypairs
    maker = Keypair.generate();
    taker = Keypair.generate();
    makerToken = PublicKey.unique();
    takerToken = PublicKey.unique();

    // Fund maker and taker from provider wallet (avoid devnet rate limits)
    const fundTx = new anchor.web3.Transaction()
      .add(
        anchor.web3.SystemProgram.transfer({
          fromPubkey: provider.wallet.publicKey,
          toPubkey: maker.publicKey,
          lamports: 0.1 * anchor.web3.LAMPORTS_PER_SOL,
        })
      )
      .add(
        anchor.web3.SystemProgram.transfer({
          fromPubkey: provider.wallet.publicKey,
          toPubkey: taker.publicKey,
          lamports: 0.1 * anchor.web3.LAMPORTS_PER_SOL,
        })
      );
    
    await provider.sendAndConfirm(fundTx);

    // Generate unique match ID
    matchId = new BN(Date.now());

    // Derive trade escrow PDA
    [tradeEscrowPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('trade_escrow'), matchId.toArrayLike(Buffer, 'le', 8)],
      program.programId
    );

    // Derive token accounts (ATAs for users, PDAs for escrow)
    makerTokenAccount = getAssociatedTokenAddressSync(makerToken, maker.publicKey);
    takerTokenAccount = getAssociatedTokenAddressSync(takerToken, taker.publicKey);
    escrowMakerTokenAccount = getAssociatedTokenAddressSync(makerToken, tradeEscrowPda, true);
    escrowTakerTokenAccount = getAssociatedTokenAddressSync(takerToken, tradeEscrowPda, true);

    console.log('Test Setup:');
    console.log('  Match ID:', matchId.toString());
    console.log('  Trade Escrow PDA:', tradeEscrowPda.toBase58());
    console.log('  Maker:', maker.publicKey.toBase58());
    console.log('  Taker:', taker.publicKey.toBase58());
    console.log('  Maker Token:', makerToken.toBase58());
    console.log('  Taker Token:', takerToken.toBase58());
  });

  describe('1. Initialize Trade Escrow', () => {
    it('should create trade escrow for matched order', async () => {
      const tx = await program.methods
        .initEscrow(
          matchId,
          maker.publicKey,
          taker.publicKey,
          makerToken,
          takerToken,
          makerAmount,
          takerAmount
        )
        .accounts({
          authority: provider.wallet.publicKey,
        })
        .rpc();

      console.log('  Init escrow tx:', tx);

      // Verify escrow state
      const escrow = await program.account.tradeEscrow.fetch(tradeEscrowPda);
      expect(escrow.matchId.toString()).to.equal(matchId.toString());
      expect(escrow.maker.toBase58()).to.equal(maker.publicKey.toBase58());
      expect(escrow.taker.toBase58()).to.equal(taker.publicKey.toBase58());
      expect(escrow.makerToken.toBase58()).to.equal(makerToken.toBase58());
      expect(escrow.takerToken.toBase58()).to.equal(takerToken.toBase58());
      expect(escrow.makerAmount.toString()).to.equal(makerAmount.toString());
      expect(escrow.takerAmount.toString()).to.equal(takerAmount.toString());
      expect(escrow.makerDeposited).to.equal(false);
      expect(escrow.takerDeposited).to.equal(false);
      expect(escrow.isSettled).to.equal(false);
    });
  });

  describe('2. Deposit Phase', () => {
    it('should allow maker to deposit', async () => {
      const tx = await program.methods
        .deposit(makerAmount)
        .accounts({
          depositor: maker.publicKey,
          tradeEscrow: tradeEscrowPda,
          mint: makerToken,
          depositorTokenAccount: makerTokenAccount,
          escrowTokenAccount: escrowMakerTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([maker])
        .rpc();

      console.log('  Maker deposit tx:', tx);

      const escrow = await program.account.tradeEscrow.fetch(tradeEscrowPda);
      expect(escrow.makerDeposited).to.equal(true);
      expect(escrow.takerDeposited).to.equal(false);
    });

    it('should reject maker double deposit', async () => {
      try {
        await program.methods
          .deposit(makerAmount)
          .accounts({
            depositor: maker.publicKey,
            tradeEscrow: tradeEscrowPda,
            mint: makerToken,
            depositorTokenAccount: makerTokenAccount,
            escrowTokenAccount: escrowMakerTokenAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([maker])
          .rpc();

        expect.fail('Should have thrown an error');
      } catch (err: any) {
        expect(err.toString()).to.include('AlreadyDeposited');
      }
    });

    it('should allow taker to deposit', async () => {
      const tx = await program.methods
        .deposit(takerAmount)
        .accounts({
          depositor: taker.publicKey,
          tradeEscrow: tradeEscrowPda,
          mint: takerToken,
          depositorTokenAccount: takerTokenAccount,
          escrowTokenAccount: escrowTakerTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([taker])
        .rpc();

      console.log('  Taker deposit tx:', tx);

      const escrow = await program.account.tradeEscrow.fetch(tradeEscrowPda);
      expect(escrow.makerDeposited).to.equal(true);
      expect(escrow.takerDeposited).to.equal(true);
    });

    it('should reject invalid deposit amount', async () => {
      // Create new escrow for this test
      const newMatchId = new BN(Date.now() + 1);
      const [newEscrowPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('trade_escrow'), newMatchId.toArrayLike(Buffer, 'le', 8)],
        program.programId
      );

      await program.methods
        .initEscrow(
          newMatchId,
          maker.publicKey,
          taker.publicKey,
          makerToken,
          takerToken,
          makerAmount,
          takerAmount
        )
        .accounts({
          authority: provider.wallet.publicKey,
        })
        .rpc();

      try {
        await program.methods
          .deposit(new BN(999)) // Wrong amount
          .accounts({
            depositor: maker.publicKey,
            tradeEscrow: newEscrowPda,
            mint: makerToken,
            depositorTokenAccount: makerTokenAccount,
            escrowTokenAccount: getAssociatedTokenAddressSync(makerToken, newEscrowPda, true),
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([maker])
          .rpc();

        expect.fail('Should have thrown an error');
      } catch (err: any) {
        expect(err.toString()).to.include('InvalidAmount');
      }
    });
  });

  describe('3. Settlement', () => {
    it('should settle atomic swap when both deposited', async () => {
      const tx = await program.methods
        .settleAtomicSwap()
        .accounts({
          authority: provider.wallet.publicKey,
          tradeEscrow: tradeEscrowPda,
          makerMint: makerToken,
          takerMint: takerToken,
          escrowMakerTokenAccount,
          escrowTakerTokenAccount,
          makerReceiveAccount: getAssociatedTokenAddressSync(takerToken, maker.publicKey),
          takerReceiveAccount: getAssociatedTokenAddressSync(makerToken, taker.publicKey),
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      console.log('  Settle swap tx:', tx);

      const escrow = await program.account.tradeEscrow.fetch(tradeEscrowPda);
      expect(escrow.isSettled).to.equal(true);
    });

    it('should reject settling already settled trade', async () => {
      try {
        await program.methods
          .settleAtomicSwap()
          .accounts({
            authority: provider.wallet.publicKey,
            tradeEscrow: tradeEscrowPda,
            makerMint: makerToken,
            takerMint: takerToken,
            escrowMakerTokenAccount,
            escrowTakerTokenAccount,
            makerReceiveAccount: getAssociatedTokenAddressSync(takerToken, maker.publicKey),
            takerReceiveAccount: getAssociatedTokenAddressSync(makerToken, taker.publicKey),
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc();

        expect.fail('Should have thrown an error');
      } catch (err: any) {
        expect(err.toString()).to.include('TradeAlreadySettled');
      }
    });
  });

  describe('4. Withdrawal (Cancel Flow)', () => {
    let cancelEscrowPda: PublicKey;
    let cancelMatchId: BN;

    before(async () => {
      // Create new escrow for withdrawal test
      cancelMatchId = new BN(Date.now() + 100);
      [cancelEscrowPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('trade_escrow'), cancelMatchId.toArrayLike(Buffer, 'le', 8)],
        program.programId
      );

      await program.methods
        .initEscrow(
          cancelMatchId,
          maker.publicKey,
          taker.publicKey,
          makerToken,
          takerToken,
          makerAmount,
          takerAmount
        )
        .accounts({
          authority: provider.wallet.publicKey,
        })
        .rpc();

      // Maker deposits
      const cancelEscrowMakerTokenAccount = getAssociatedTokenAddressSync(makerToken, cancelEscrowPda, true);
      await program.methods
        .deposit(makerAmount)
        .accounts({
          depositor: maker.publicKey,
          tradeEscrow: cancelEscrowPda,
          mint: makerToken,
          depositorTokenAccount: makerTokenAccount,
          escrowTokenAccount: cancelEscrowMakerTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([maker])
        .rpc();
    });

    it('should allow maker to withdraw if trade cancelled', async () => {
      const cancelEscrowMakerTokenAccount = getAssociatedTokenAddressSync(makerToken, cancelEscrowPda, true);
      const tx = await program.methods
        .withdraw()
        .accounts({
          withdrawer: maker.publicKey,
          tradeEscrow: cancelEscrowPda,
          mint: makerToken,
          escrowTokenAccount: cancelEscrowMakerTokenAccount,
          withdrawerTokenAccount: makerTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([maker])
        .rpc();

      console.log('  Withdraw tx:', tx);
    });

    it('should reject withdrawal from non-depositor', async () => {
      const cancelEscrowTakerTokenAccount = getAssociatedTokenAddressSync(takerToken, cancelEscrowPda, true);
      try {
        await program.methods
          .withdraw()
          .accounts({
            withdrawer: taker.publicKey, // Taker never deposited
            tradeEscrow: cancelEscrowPda,
            mint: takerToken,
            escrowTokenAccount: cancelEscrowTakerTokenAccount,
            withdrawerTokenAccount: takerTokenAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([taker])
          .rpc();

        expect.fail('Should have thrown an error');
      } catch (err: any) {
        expect(err.toString()).to.include('NoDeposit');
      }
    });
  });
});
