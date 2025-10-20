import { InlineKeyboard } from 'grammy';
import { BotContext } from '../index';
import { prisma } from '../lib/prisma';
import { createKYCService } from '../services/kyc-service';

const kycService = createKYCService();

export async function kycCommand(ctx: BotContext) {
  const telegramId = ctx.from?.id;
  if (!telegramId) return ctx.reply('❌ Unable to identify user');

  const user = await prisma.user.findUnique({
    where: { telegramId: BigInt(telegramId) }
  });

  if (!user) {
    return ctx.reply('⚠️ Please connect your wallet first! Use /start');
  }

  // Check current status
  if (user.kycStatus === 'verified') {
    const expiresAt = user.kycExpiresAt ? new Date(user.kycExpiresAt).toLocaleDateString() : 'Never';
    return ctx.reply(
      '✅ *KYC Verified*\n\n' +
      `Provider: ${user.kycProvider || 'Unknown'}\n` +
      `Verified: ${user.kycVerifiedAt ? new Date(user.kycVerifiedAt).toLocaleDateString() : 'N/A'}\n` +
      `Expires: ${expiresAt}\n\n` +
      `Attestation: \`${user.kycAttestation?.slice(0, 8)}...\`\n\n` +
      'You can now place orders!',
      { parse_mode: 'Markdown' }
    );
  }

  if (user.kycStatus === 'pending') {
    const keyboard = new InlineKeyboard()
      .text('🔄 Check Status', 'kyc:check')
      .text('🔗 Resume KYC', 'kyc:resume');

    return ctx.reply(
      '⏳ *KYC Pending*\n\n' +
      'Your KYC verification is in progress.\n\n' +
      'Click below to check status or resume.',
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
  }

  // Start new KYC flow
  const keyboard = new InlineKeyboard()
    .text('🚀 Start KYC', 'kyc:start');

  await ctx.reply(
    '🔐 *KYC Verification Required*\n\n' +
    '**What we verify:**\n' +
    '• Identity document\n' +
    '• Sanctions screening\n' +
    '• Country eligibility\n\n' +
    '**Privacy:**\n' +
    '• Data encrypted on-chain (SAS)\n' +
    '• Reusable across Solana dApps\n' +
    '• No documents stored by us\n\n' +
    '**Time:** ~3-5 minutes\n\n' +
    'Ready to verify?',
    { parse_mode: 'Markdown', reply_markup: keyboard }
  );
}
