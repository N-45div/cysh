import { BotContext } from '../index';

export async function helpCommand(ctx: BotContext) {
  await ctx.reply(
    '❓ *Shadow OTC Nexus Help*\n\n' +
    '*Commands:*\n' +
    '/start - Connect wallet & get started\n' +
    '/order - Place encrypted order\n' +
    '/balance - Check wallet balances\n' +
    '/status - View order status\n' +
    '/kyc - Complete KYC\n' +
    '/cancel - Cancel pending order\n\n' +
    '*How it works:*\n' +
    '1. Orders are encrypted client-side\n' +
    '2. Arcium MPC matches privately\n' +
    '3. magicblock batches settlement\n' +
    '4. Solana executes atomically\n\n' +
    'Support: @shadowotc_support',
    { parse_mode: 'Markdown' }
  );
}
