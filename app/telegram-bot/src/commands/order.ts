/**
 * /order command - Place encrypted orders
 */

import { InlineKeyboard } from 'grammy';
import { BotContext } from '../index';
import { prisma } from '../lib/prisma';
import { PublicKey } from '@solana/web3.js';

export async function orderCommand(ctx: BotContext) {
  const telegramId = ctx.from?.id;
  
  if (!telegramId) {
    return ctx.reply('❌ Unable to identify user');
  }

  // Check if user is connected
  const user = await prisma.user.findUnique({
    where: { telegramId: BigInt(telegramId) }
  });

  if (!user) {
    return ctx.reply(
      '⚠️ Please connect your wallet first!\n\nUse /start to get started.',
      {
        reply_markup: new InlineKeyboard().text('🔗 Connect Wallet', 'action:connect_wallet')
      }
    );
  }

  // Check KYC status
  if (user.kycStatus !== 'verified') {
    return ctx.reply(
      '🔐 *KYC Required*\n\n' +
      'You must complete KYC verification before placing orders.\n\n' +
      'Use /kyc to start the verification process.',
      {
        parse_mode: 'Markdown',
        reply_markup: new InlineKeyboard().text('🔐 Start KYC', 'action:start_kyc')
      }
    );
  }

  // Parse order command
  // Format: /order [buy|sell] [token] [amount] at [price]
  // Example: /order sell SOL 100 at 200
  const text = ctx.message?.text;
  if (!text) return;

  const parts = text.split(' ').slice(1); // Remove '/order'
  
  if (parts.length === 0) {
    // Show order menu
    const keyboard = new InlineKeyboard()
      .text('📈 Buy Order', 'order:buy')
      .text('📉 Sell Order', 'order:sell');

    return ctx.reply(
      '💰 *Place New Order*\n\n' +
      'Choose order type or use command format:\n' +
      '`/order [buy|sell] [token] [amount] at [price]`\n\n' +
      '*Examples:*\n' +
      '• `/order buy SOL 100 at 200`\n' +
      '• `/order sell USDC 50000 at 1.00`',
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      }
    );
  }

  // Parse order parameters
  try {
    const orderType = parts[0]?.toLowerCase();
    if (!['buy', 'sell'].includes(orderType)) {
      throw new Error('Order type must be "buy" or "sell"');
    }

    const token = parts[1]?.toUpperCase();
    const amount = parseFloat(parts[2]);
    const price = parseFloat(parts[4]); // parts[3] is 'at'

    if (!token || isNaN(amount) || isNaN(price)) {
      throw new Error('Invalid order format');
    }

    // Store pending order in session
    ctx.session.pendingAction = 'submit_order';
    ctx.session.orderData = {
      type: orderType as 'buy' | 'sell',
      token,
      amount,
      price
    };

    // Confirm order details
    const keyboard = new InlineKeyboard()
      .text('✅ Confirm', 'order:confirm')
      .text('❌ Cancel', 'order:cancel');

    await ctx.reply(
      `📋 *Order Confirmation*\n\n` +
      `Type: ${orderType === 'buy' ? '📈 BUY' : '📉 SELL'}\n` +
      `Token: ${token}\n` +
      `Amount: ${amount.toLocaleString()}\n` +
      `Price: $${price.toFixed(2)}\n` +
      `Total: $${(amount * price).toLocaleString(undefined, { minimumFractionDigits: 2 })}\n\n` +
      `⚠️ *Note:* Your order will be encrypted and matched privately via Arcium MPC.\n\n` +
      `Confirm to proceed?`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      }
    );

  } catch (error: any) {
    await ctx.reply(
      `❌ *Invalid Order Format*\n\n` +
      `${error.message}\n\n` +
      `*Correct format:*\n` +
      '`/order [buy|sell] [token] [amount] at [price]`\n\n' +
      '*Example:*\n' +
      '`/order sell SOL 100 at 200`',
      { parse_mode: 'Markdown' }
    );
  }
}
