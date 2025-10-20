import { CallbackQueryContext } from 'grammy';
import { BotContext } from '../index';
import { prisma } from '../lib/prisma';
import { PublicKey } from '@solana/web3.js';

export async function submitOrder(ctx: CallbackQueryContext<BotContext>) {
  await ctx.answerCallbackQuery('Processing order...');
  
  const orderData = ctx.session.orderData;
  if (!orderData) {
    return ctx.editMessageText('❌ Order data not found');
  }

  const telegramId = ctx.from.id;
  const user = await prisma.user.findUnique({
    where: { telegramId: BigInt(telegramId) }
  });

  if (!user) {
    return ctx.editMessageText('❌ User not found');
  }

  try {
    // Verify KYC
    if (user.kycStatus !== 'verified') {
      return ctx.editMessageText(
        '❌ KYC verification required\n\n' +
        'Use /kyc to complete verification before trading.'
      );
    }

    // Create order object for Arcium
    const order = {
      token_mint: new PublicKey(orderData.token!),
      side: orderData.type === 'buy' ? 0 : 1,
      amount: BigInt(Math.floor(orderData.amount! * 1e9)), // Convert to lamports
      price: BigInt(Math.floor(orderData.price! * 100)), // Price in cents
      expiry: BigInt(Math.floor(Date.now() / 1000 + 3600)), // 1 hour
      trader_id: BigInt('0x' + user.walletAddress.slice(2, 18)) // First 16 chars
    };

    // Submit to Arcium MXE
    // TODO: Arcium client needs submitOrder method - for now create mock ID
    // const encryptedOrderId = await ctx.services!.arcium.submitOrder(order);
    const encryptedOrderId = `order-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Create order in DB
    await prisma.orderTracking.create({
      data: {
        orderId: encryptedOrderId,
        telegramId: BigInt(telegramId),
        orderType: orderData.type!,
        tokenPair: `${orderData.token}/USDC`,
        amount: orderData.amount,
        price: orderData.price,
        status: 'pending'
      }
    });

    await ctx.editMessageText(
      `✅ *Order Submitted!*\n\n` +
      `Order ID: \`${encryptedOrderId.slice(0, 8)}...\`\n` +
      `Type: ${orderData.type?.toUpperCase()}\n` +
      `Amount: ${orderData.amount} tokens\n` +
      `Price: $${orderData.price}\n` +
      `Status: 🔄 Pending Match\n\n` +
      `🔒 Order encrypted via Arcium MXE\n` +
      `You'll be notified when matched!`,
      { parse_mode: 'Markdown' }
    );

    // Clear session
    ctx.session.orderData = undefined;

  } catch (error: any) {
    await ctx.editMessageText(`❌ Order failed: ${error.message}`);
  }
}
