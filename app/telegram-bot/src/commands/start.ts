/**
 * /start command - Welcome and wallet connection
 */

import { InlineKeyboard } from 'grammy';
import { BotContext } from '../index';
import { prisma } from '../lib/prisma';

export async function startCommand(ctx: BotContext) {
  const telegramId = ctx.from?.id;
  
  if (!telegramId) {
    return ctx.reply('❌ Unable to identify user');
  }

  // Check if user exists
  const existingUser = await prisma.user.findUnique({
    where: { telegramId: BigInt(telegramId) }
  });

  if (existingUser) {
    // Existing user - show dashboard
    const keyboard = new InlineKeyboard()
      .text('💰 Place Order', 'action:new_order')
      .text('📊 My Orders', 'action:view_orders').row()
      .text('💎 Balance', 'action:check_balance')
      .text('❓ Help', 'action:help');

    return ctx.reply(
      `🌑 *Welcome back to Shadow OTC Nexus!*\n\n` +
      `👤 Wallet: \`${existingUser.walletAddress.slice(0, 8)}...${existingUser.walletAddress.slice(-6)}\`\n` +
      `🔐 KYC: ${existingUser.kycStatus === 'verified' ? '✅ Verified' : '⚠️ Not verified'}\n\n` +
      `What would you like to do?`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      }
    );
  }

  // New user - show welcome and connect wallet button
  const keyboard = new InlineKeyboard()
    .url('🔗 Connect Phantom Wallet', generateWalletConnectUrl(telegramId))
    .row()
    .text('❓ How it works', 'action:how_it_works');

  await ctx.reply(
    `🌑 *Welcome to Shadow OTC Nexus*\n\n` +
    `Privacy-first OTC trading for Solana whales.\n\n` +
    `✨ *Features:*\n` +
    `• 🔒 Fully encrypted orders (Arcium MPC)\n` +
    `• ⚡ Zero-fee batching (magicblock ER)\n` +
    `• 🛡️ MEV-resistant settlement\n` +
    `• 🔐 KYC-compliant & secure\n\n` +
    `*Get Started:*\n` +
    `1️⃣ Connect your Phantom wallet\n` +
    `2️⃣ Complete KYC verification\n` +
    `3️⃣ Start trading privately!\n\n` +
    `Tap below to connect your wallet:`,
    {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    }
  );
}

/**
 * Generate wallet connect URL
 * For now, we'll use a simple approach: ask user to paste their wallet address
 * In production, implement proper signature verification via web interface
 */
function generateWalletConnectUrl(telegramId: number): string {
  // TODO: Create web interface for signature verification
  // For now, return instructions URL
  return `https://phantom.app/download`;
}
