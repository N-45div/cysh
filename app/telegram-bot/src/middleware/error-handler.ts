import { BotError } from 'grammy';
import { BotContext } from '../index';

export async function errorHandler(err: BotError<BotContext>) {
  const ctx = err.ctx;
  console.error(`Error handling update ${ctx.update.update_id}:`, err.error);

  try {
    await ctx.reply('❌ An error occurred. Please try again.');
  } catch (replyErr) {
    console.error('Failed to send error message:', replyErr);
  }
}
