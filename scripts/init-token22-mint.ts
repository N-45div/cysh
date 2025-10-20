#!/usr/bin/env ts-node
/**
 * Initialize a Token-2022 mint with confidential transfer extension
 * 
 * Usage:
 *   pnpm exec ts-node scripts/init-token22-mint.ts --decimals 6 --authority <PUBKEY>
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { createConfidentialMint } from '../packages/sdk/src/solana/token22';
import * as fs from 'fs';
import * as path from 'path';

interface Args {
  rpcUrl: string;
  payerPath: string;
  decimals: number;
  authority: string;
  freezeAuthority?: string;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const parsed: Partial<Args> = {
    rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
    payerPath: process.env.SOLANA_WALLET_PATH || path.join(process.env.HOME || '', '.config/solana/id.json'),
    decimals: 6,
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
      case '--decimals':
        parsed.decimals = parseInt(value);
        break;
      case '--authority':
        parsed.authority = value;
        break;
      case '--freeze-authority':
        parsed.freezeAuthority = value;
        break;
      default:
        console.error(`Unknown flag: ${flag}`);
        process.exit(1);
    }
  }

  if (!parsed.authority) {
    console.error('Error: --authority is required');
    console.log('\nUsage:');
    console.log('  pnpm exec ts-node scripts/init-token22-mint.ts --decimals 6 --authority <PUBKEY>');
    console.log('\nOptions:');
    console.log('  --rpc-url <URL>           RPC endpoint (default: SOLANA_RPC_URL or devnet)');
    console.log('  --payer <PATH>            Path to payer keypair (default: ~/.config/solana/id.json)');
    console.log('  --decimals <NUM>          Token decimals (default: 6)');
    console.log('  --authority <PUBKEY>      Mint authority (required)');
    console.log('  --freeze-authority <PUBKEY>  Freeze authority (optional)');
    process.exit(1);
  }

  return parsed as Args;
}

async function main() {
  const args = parseArgs();

  console.log('Initializing Token-2022 confidential mint...');
  console.log('  RPC:', args.rpcUrl);
  console.log('  Decimals:', args.decimals);
  console.log('  Authority:', args.authority);
  if (args.freezeAuthority) {
    console.log('  Freeze Authority:', args.freezeAuthority);
  }

  // Load payer keypair
  const payerKeypairData = JSON.parse(fs.readFileSync(args.payerPath, 'utf-8'));
  const payer = Keypair.fromSecretKey(new Uint8Array(payerKeypairData));
  console.log('  Payer:', payer.publicKey.toBase58());

  // Create connection
  const connection = new Connection(args.rpcUrl, 'confirmed');

  // Create confidential mint
  const mint = await createConfidentialMint(connection, payer, {
    decimals: args.decimals,
    authority: new PublicKey(args.authority),
    freezeAuthority: args.freezeAuthority ? new PublicKey(args.freezeAuthority) : undefined,
    autoApproveNewAccounts: true,
  });

  console.log('\n✅ Confidential mint created successfully!');
  console.log('  Mint Address:', mint.toBase58());
  console.log('\nSave this address for future use.');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
