/**
 * Example: Complete Settlement Flow
 * Shows how to use the Settlement SDK for atomic swaps
 */

import { AnchorProvider, Program, BN } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { createSettlementClient } from '../src/settlement';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  // Setup connection and provider
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  const wallet = {
    publicKey: Keypair.generate().publicKey,
    signTransaction: async (tx: any) => tx,
    signAllTransactions: async (txs: any[]) => txs,
  };
  const provider = new AnchorProvider(connection, wallet as any, {});

  // Load program
  const programId = new PublicKey('HkamtrV1uGYGHgL8rZxmXubtnLawS3yiizCBQXCpiZds');
  const idlPath = path.join(__dirname, '../../../programs/settlement/target/idl/settlement.json');
  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));
  const program = new Program(idl, provider);

  // Create settlement client
  const client = createSettlementClient(program, provider);

  console.log('Settlement SDK Example\n');

  // Example 1: Initialize trade escrow
  const matchId = new BN(Date.now());
  const maker = Keypair.generate().publicKey;
  const taker = Keypair.generate().publicKey;
  const usdcMint = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'); // USDC devnet
  const solMint = new PublicKey('So11111111111111111111111111111111111111112'); // Wrapped SOL

  console.log('1. Initialize Trade Escrow');
  console.log(`   Match ID: ${matchId.toString()}`);
  console.log(`   Maker: ${maker.toBase58()}`);
  console.log(`   Taker: ${taker.toBase58()}`);
  console.log(`   Swap: 100 USDC <-> 1 SOL\n`);

  try {
    const tx = await client.initEscrow({
      matchId,
      maker,
      taker,
      makerToken: usdcMint,
      takerToken: solMint,
      makerAmount: new BN(100_000000), // 100 USDC (6 decimals)
      takerAmount: new BN(1_000000000), // 1 SOL (9 decimals)
    });
    console.log(`   ✓ Escrow initialized: ${tx}\n`);
  } catch (err) {
    console.log(`   ✗ Error: ${err}\n`);
  }

  // Example 2: Get escrow data
  console.log('2. Fetch Escrow Data');
  try {
    const escrow = await client.getTradeEscrow(matchId);
    console.log(`   Match ID: ${escrow.matchId.toString()}`);
    console.log(`   Maker deposited: ${escrow.makerDeposited}`);
    console.log(`   Taker deposited: ${escrow.takerDeposited}`);
    console.log(`   Settled: ${escrow.isSettled}\n`);
  } catch (err) {
    console.log(`   ✗ Error: ${err}\n`);
  }

  // Example 3: Deposit (would need actual keypairs)
  console.log('3. Deposit Flow');
  console.log(`   Maker deposits 100 USDC to escrow`);
  console.log(`   Taker deposits 1 SOL to escrow`);
  console.log(`   (Requires actual keypairs with tokens)\n`);

  // Example 4: Settle atomic swap
  console.log('4. Settle Atomic Swap');
  console.log(`   When both deposited, authority settles swap`);
  console.log(`   Maker receives 1 SOL`);
  console.log(`   Taker receives 100 USDC\n`);

  // Example 5: Batch operations
  console.log('5. Batch Operations (for ER)');
  const batchId = new BN(Date.now());
  console.log(`   Batch ID: ${batchId.toString()}`);
  console.log(`   Collect multiple trades → batch commit to mainnet\n`);

  console.log('✓ Settlement SDK ready for integration!');
}

main().catch(console.error);
