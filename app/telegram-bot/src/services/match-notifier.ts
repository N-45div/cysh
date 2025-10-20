/**
 * Match Notification Service
 * Polls for matched orders and notifies users
 */

import { Bot } from 'grammy';
import { BotContext } from '../index';
import { prisma } from '../lib/prisma';

/**
 * Start polling for matched orders
 */
export function startMatchNotifier(bot: Bot<BotContext>, intervalMs: number = 30000) {
  console.log(`🔔 Match notifier started (polling every ${intervalMs / 1000}s)`);

  const pollInterval = setInterval(async () => {
    try {
      // Get all pending orders
      const pendingOrders = await prisma.orderTracking.findMany({
        where: { status: 'pending' }
      });

      if (pendingOrders.length === 0) return;

      console.log(`🔍 Checking ${pendingOrders.length} pending orders...`);

      // TODO: Query Arcium/Settlement program for matches
      // For now, this is a stub that will be implemented when Arcium DKG is ready

      // Example: Check each order
      // for (const order of pendingOrders) {
      //   const isMatched = await checkIfOrderMatched(order.orderId);
      //   
      //   if (isMatched) {
      //     await prisma.orderTracking.update({
      //       where: { id: order.id },
      //       data: { status: 'matched' }
      //     });
      //
      //     await bot.api.sendMessage(
      //       Number(order.telegramId),
      //       `✅ *Order Matched!*\n\n` +
      //       `Order ID: \`${order.orderId.slice(0, 8)}...\`\n` +
      //       `Type: ${order.orderType.toUpperCase()}\n` +
      //       `Amount: ${order.amount}\n\n` +
      //       `Settlement in progress...`,
      //       { parse_mode: 'Markdown' }
      //     );
      //   }
      // }

    } catch (error) {
      console.error('Match notifier error:', error);
    }
  }, intervalMs);

  return () => {
    clearInterval(pollInterval);
    console.log('🔕 Match notifier stopped');
  };
}

/**
 * Check if an order has been matched (to be implemented)
 */
async function checkIfOrderMatched(orderId: string): Promise<boolean> {
  // TODO: Query Arcium program or settlement program
  // This will be implemented once Arcium cluster DKG is complete
  return false;
}
