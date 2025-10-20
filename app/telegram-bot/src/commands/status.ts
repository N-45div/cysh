import { BotContext } from '../index';
import { prisma } from '../lib/prisma';

export async function statusCommand(ctx: BotContext) {
  const telegramId = ctx.from?.id;
  if (!telegramId) return ctx.reply('❌ Unable to identify user');

  const orders = await prisma.orderTracking.findMany({
    where: { telegramId: BigInt(telegramId) },
    orderBy: { createdAt: 'desc' },
    take: 5
  });

  if (orders.length === 0) {
    return ctx.reply('📊 You have no orders yet. Use /order to place one!');
  }

  const statusText = orders.map(o => 
    `${o.orderType === 'buy' ? '📈' : '📉'} ${o.tokenPair} ${o.amount} - ${o.status}`
  ).join('\n');

  await ctx.reply(`📊 *Your Recent Orders*\n\n${statusText}`, { parse_mode: 'Markdown' });
}
