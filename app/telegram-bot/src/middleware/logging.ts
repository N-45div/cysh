import { BotContext } from '../index';
import { prisma } from '../lib/prisma';

export async function loggingMiddleware(ctx: BotContext, next: () => Promise<void>) {
  const start = Date.now();
  const from = ctx.from;
  const message = ctx.message?.text || ctx.callbackQuery?.data || 'unknown';

  console.log(`[${from?.id}] ${from?.username}: ${message}`);

  // Audit log
  if (from) {
    await prisma.auditLog.create({
      data: {
        telegramId: BigInt(from.id),
        action: message,
        details: { type: ctx.update ? 'update' : 'unknown' }
      }
    }).catch((err: Error) => console.error('Audit log failed:', err));
  }

  await next();

  console.log(`[${from?.id}] Completed in ${Date.now() - start}ms`);
}
