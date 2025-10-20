import { BotContext } from '../index';

export async function cancelCommand(ctx: BotContext) {
  ctx.session.pendingAction = undefined;
  ctx.session.orderData = undefined;
  await ctx.reply('❌ Action cancelled');
}
