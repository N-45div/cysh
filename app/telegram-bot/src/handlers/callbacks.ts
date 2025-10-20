import { Bot, InlineKeyboard } from 'grammy';
import { BotContext } from '../index';
import { submitOrder } from './order-submission';

export function setupCallbackQueries(bot: Bot<BotContext>) {
  // Order confirmation
  bot.callbackQuery('order:confirm', submitOrder);
  bot.callbackQuery('order:cancel', async (ctx) => {
    await ctx.answerCallbackQuery('Order cancelled');
    await ctx.editMessageText('❌ Order cancelled');
  });

  // Order type selection
  bot.callbackQuery(/^order:(buy|sell)$/, async (ctx) => {
    const type = ctx.match[1];
    ctx.session.orderData = { type: type as 'buy' | 'sell' };
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `Selected: ${type === 'buy' ? '📈 BUY' : '📉 SELL'}\n\n` +
      'Use: `/order ${type} [token] [amount] at [price]`',
      { parse_mode: 'Markdown' }
    );
  });

  // KYC actions
  bot.callbackQuery('kyc:start', async (ctx) => {
    const telegramId = ctx.from.id;
    const user = await ctx.prisma.user.findUnique({
      where: { telegramId: BigInt(telegramId) }
    });

    if (!user) {
      await ctx.answerCallbackQuery('Connect wallet first');
      return;
    }

    await ctx.answerCallbackQuery('Initializing KYC...');

    try {
      const kycService = (await import('../services/kyc-service')).createKYCService();
      const { kycUrl, sessionId } = await kycService.initiateKYC(
        BigInt(telegramId),
        user.walletAddress
      );

      const keyboard = new InlineKeyboard()
        .url('🔗 Complete KYC', kycUrl)
        .row()
        .text('✅ I completed KYC', 'kyc:completed');

      await ctx.editMessageText(
        '🔐 *KYC Started*\n\n' +
        `Session: \`${sessionId}\`\n\n` +
        'Click below to complete verification.\n\n' +
        'After finishing, click "I completed KYC".',
        { parse_mode: 'Markdown', reply_markup: keyboard }
      );
    } catch (error: any) {
      await ctx.editMessageText(`❌ Failed to start KYC: ${error.message}`);
    }
  });

  bot.callbackQuery('kyc:completed', async (ctx) => {
    const telegramId = ctx.from.id;
    await ctx.answerCallbackQuery('Verifying...');

    try {
      const kycService = (await import('../services/kyc-service')).createKYCService();
      const success = await kycService.verifyAndIssueAttestation(BigInt(telegramId));

      if (success) {
        await ctx.editMessageText(
          '✅ *KYC Verified!*\n\n' +
          'Your identity has been verified and an attestation has been issued to your wallet.\n\n' +
          'You can now:\n' +
          '• Place orders with /order\n' +
          '• Trade up to $500,000\n' +
          '• Access all features\n\n' +
          'Welcome to Shadow OTC! 🌑',
          { parse_mode: 'Markdown' }
        );
      } else {
        await ctx.editMessageText(
          '⏳ *Verification Pending*\n\n' +
          'Your KYC is still being processed.\n\n' +
          'Please wait a few minutes and try again.',
          { parse_mode: 'Markdown' }
        );
      }
    } catch (error: any) {
      await ctx.editMessageText(`❌ Verification failed: ${error.message}`);
    }
  });

  bot.callbackQuery('kyc:check', async (ctx) => {
    const telegramId = ctx.from.id;
    await ctx.answerCallbackQuery('Checking status...');

    const kycService = (await import('../services/kyc-service')).createKYCService();
    const status = await kycService.checkKYCStatus(BigInt(telegramId));

    const statusEmoji = {
      none: '❓',
      pending: '⏳',
      approved: '✅',
      rejected: '❌',
      verified: '✅',
      expired: '⏰'
    };

    await ctx.editMessageText(
      `${statusEmoji[status]} *KYC Status: ${status.toUpperCase()}*\n\n` +
      (status === 'verified' ? 'You can now trade!' : 'Please wait or contact support.'),
      { parse_mode: 'Markdown' }
    );
  });

  // Generic actions
  bot.callbackQuery('action:new_order', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply('Use /order to place a new order');
  });
}
