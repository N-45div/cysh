/**
 * /balance command - Check wallet balances
 */

import { BotContext } from '../index';
import { prisma } from '../lib/prisma';
import { Connection, PublicKey } from '@solana/web3.js';
import { getAccount, getAssociatedTokenAddress } from '@solana/spl-token';
import { config } from '../config/env';

// Common token mints (devnet)
const TOKEN_MINTS = {
  USDC: new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'), // Devnet USDC
  USDT: new PublicKey('EJwZgeZrdC8TXTQbQBoL6bfuAnFUUy1PVCMB4DYPzVaS'), // Devnet USDT
};

export async function balanceCommand(ctx: BotContext) {
  const telegramId = ctx.from?.id;
  
  if (!telegramId) {
    return ctx.reply('❌ Unable to identify user');
  }

  // Check if user is connected
  const user = await prisma.user.findUnique({
    where: { telegramId: BigInt(telegramId) }
  });

  if (!user) {
    return ctx.reply('⚠️ Please connect your wallet first! Use /start');
  }

  const statusMsg = await ctx.reply('🔍 Fetching balances...');

  try {
    const connection = new Connection(config.solana.rpcUrl, 'confirmed');
    const publicKey = new PublicKey(user.walletAddress);

    // Get SOL balance
    const solBalance = await connection.getBalance(publicKey);
    const solBalanceFormatted = (solBalance / 1e9).toFixed(4);

    // Get SPL token balances
    const tokenBalances: Record<string, string> = {};
    
    for (const [symbol, mint] of Object.entries(TOKEN_MINTS)) {
      try {
        const ata = await getAssociatedTokenAddress(mint, publicKey);
        const account = await getAccount(connection, ata);
        const decimals = 6; // USDC/USDT use 6 decimals
        tokenBalances[symbol] = (Number(account.amount) / Math.pow(10, decimals)).toFixed(2);
      } catch {
        tokenBalances[symbol] = '0.00';
      }
    }
    
    await ctx.api.editMessageText(
      ctx.chat!.id,
      statusMsg.message_id,
      `💎 *Your Balances*\n\n` +
      `Wallet: \`${user.walletAddress.slice(0, 8)}...${user.walletAddress.slice(-6)}\`\n\n` +
      `💰 SOL: ${solBalanceFormatted}\n` +
      `💵 USDC: ${tokenBalances.USDC}\n` +
      `💵 USDT: ${tokenBalances.USDT}\n\n` +
      `_Balances from ${config.solana.network}_`,
      { parse_mode: 'Markdown' }
    );

  } catch (error: any) {
    await ctx.api.editMessageText(
      ctx.chat!.id,
      statusMsg.message_id,
      `❌ Failed to fetch balances: ${error.message}`
    );
  }
}
