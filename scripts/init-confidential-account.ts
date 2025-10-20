#!/usr/bin/env ts-node
/**
 * Initialize a confidential token account for a user
 * 
 * Usage:
 *   pnpm exec ts-node scripts/init-confidential-account.ts --mint <MINT> --owner <OWNER>
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { initializeConfidentialAccount } from '../packages/sdk/src/solana/token22';
import * as fs from 'fs';
import * as path from 'path';

interface Args {
  rpcUrl: string;
  payerPath: string;
  mint: string;
  owner: string;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const parsed: Partial<Args> = {
    rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
    payerPath: process.env.SOLANA_WALLET_PATH || path.join(process.env.HOME || '', '.config/solana/id.json'),
  };

  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];

    switch (flag) {
      case '--rpc-url':
        parsed.rpcUrl = value;
        break;
      case '--payer':
        parsed.payerPath = value;
        break;
      case '--mint':
        parsed.mint = value;
        break;
      case '--owner':
        parsed.owner = value;
        break;
      default:
        console.error(`Unknown flag: ${flag}`);
        process.exit(1);
    }
  }

  if (!parsed.mint || !parsed.owner) {
    console.error('Error: --mint and --owner are required');
    console.log('\nUsage:');
    console.log('  pnpm exec ts-node scripts/init-confidential-account.ts --mint <MINT> --owner <OWNER>');
    console.log('\nOptions:');
    console.log('  --rpc-url <URL>    RPC endpoint (default: SOLANA_RPC_URL or devnet)');
    console.log('  --payer <PATH>     Path to payer keypair (default: ~/.config/solana/id.json)');
    console.log('  --mint <PUBKEY>    Token mint address (required)');
    console.log('  --owner <PUBKEY>   Account owner (required)');
    process.exit(1);
  }

  return parsed as Args;
}

async function main() {
  const args = parseArgs();

  console.log('Initializing confidential token account...');
  console.log('  RPC:', args.rpcUrl);
  console.log('  Mint:', args.mint);
  console.log('  Owner:', args.owner);

  // Load payer keypair
  const payerKeypairData = JSON.parse(fs.readFileSync(args.payerPath, 'utf-8'));
  const payer = Keypair.fromSecretKey(new Uint8Array(payerKeypairData));
  console.log('  Payer:', payer.publicKey.toBase58());

  // Create connection
  const connection = new Connection(args.rpcUrl, 'confirmed');

  // Initialize confidential account
  const account = await initializeConfidentialAccount(
    connection,
    payer,
    new PublicKey(args.mint),
    new PublicKey(args.owner)
  );

  console.log('\n✅ Confidential account created successfully!');
  console.log('  Account Address:', account.toBase58());
  console.log('  Owner:', args.owner);
  console.log('  Mint:', args.mint);
  console.log('\nSave this address for future use.');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
