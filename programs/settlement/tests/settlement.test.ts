/**
 * Settlement Program Test Suite
 * Tests base batch instructions (initialize, add, finalize)
 */

import * as anchor from '@coral-xyz/anchor';
import { Program, BN } from '@coral-xyz/anchor';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { expect } from 'chai';
import { Settlement } from '../target/types/settlement';

describe('Settlement Program - Base Instructions', () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Settlement as Program<Settlement>;

  let batchId: BN;
  let batchEscrowPda: PublicKey;
  let batchBump: number;

  before(async () => {
    // Generate unique batch ID for this test run
    batchId = new BN(Date.now());
    
    // Derive batch escrow PDA
    [batchEscrowPda, batchBump] = PublicKey.findProgramAddressSync(
      [Buffer.from('batch_escrow'), batchId.toArrayLike(Buffer, 'le', 8)],
      program.programId
    );

    console.log('Test Setup:');
    console.log('  Batch ID:', batchId.toString());
    console.log('  Batch Escrow PDA:', batchEscrowPda.toBase58());
    console.log('  Program ID:', program.programId.toBase58());
  });

  describe('1. Initialize Batch', () => {
    it('should initialize batch escrow', async () => {
      const tx = await program.methods
        .initializeBatch(batchId)
        .accountsPartial({
          authority: provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log('  Initialize batch tx:', tx);

      // Fetch and verify batch escrow account
      const batchEscrow = await program.account.batchEscrow.fetch(batchEscrowPda);
      expect(batchEscrow.batchId.toString()).to.equal(batchId.toString());
      expect(batchEscrow.authority.toBase58()).to.equal(provider.wallet.publicKey.toBase58());
      expect(batchEscrow.orderCount).to.equal(0);
      expect(batchEscrow.totalVolume.toString()).to.equal('0');
      expect(batchEscrow.isFinalized).to.equal(false);
    });
  });

  describe('2. Add Orders to Batch', () => {
    it('should add first order to batch', async () => {
      const tokenMint = PublicKey.unique();
      const amount = new BN(1000);
      const price = new BN(100);

      const tx = await program.methods
        .addToBatch(tokenMint, amount, price)
        .accountsPartial({
          payer: provider.wallet.publicKey,
          batchEscrow: batchEscrowPda,
        })
        .rpc();

      console.log('  Add order tx:', tx);

      // Verify batch state
      const batchEscrow = await program.account.batchEscrow.fetch(batchEscrowPda);
      expect(batchEscrow.orderCount).to.equal(1);
      expect(batchEscrow.totalVolume.toString()).to.equal('1000');
    });

    it('should add second order to batch', async () => {
      const tokenMint = PublicKey.unique();
      const amount = new BN(2000);
      const price = new BN(150);

      const tx = await program.methods
        .addToBatch(tokenMint, amount, price)
        .accountsPartial({
          payer: provider.wallet.publicKey,
          batchEscrow: batchEscrowPda,
        })
        .rpc();

      console.log('  Add order tx:', tx);

      // Verify batch state
      const batchEscrow = await program.account.batchEscrow.fetch(batchEscrowPda);
      expect(batchEscrow.orderCount).to.equal(2);
      expect(batchEscrow.totalVolume.toString()).to.equal('3000');
    });
  });

  describe('3. Finalize Batch', () => {
    it('should finalize the batch', async () => {
      const tx = await program.methods
        .finalizeBatch()
        .accountsPartial({
          authority: provider.wallet.publicKey,
          batchEscrow: batchEscrowPda,
        })
        .rpc();

      console.log('  Finalize batch tx:', tx);

      // Verify batch is finalized
      const batchEscrow = await program.account.batchEscrow.fetch(batchEscrowPda);
      expect(batchEscrow.isFinalized).to.equal(true);
    });

    it('should reject adding orders to finalized batch', async () => {
      const tokenMint = PublicKey.unique();
      const amount = new BN(500);
      const price = new BN(120);

      try {
        await program.methods
          .addToBatch(tokenMint, amount, price)
          .accountsPartial({
            payer: provider.wallet.publicKey,
            batchEscrow: batchEscrowPda,
          })
          .rpc();
        
        expect.fail('Should have thrown an error');
      } catch (err: any) {
        expect(err.toString()).to.include('BatchFinalized');
      }
    });
  });
});
