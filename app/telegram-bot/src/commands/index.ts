/**
 * Command registry and setup
 */

import { Bot } from 'grammy';
import { BotContext } from '../index';
import { startCommand } from './start';
import { orderCommand } from './order';
import { balanceCommand } from './balance';
import { statusCommand } from './status';
import { kycCommand } from './kyc';
import { helpCommand } from './help';
import { cancelCommand } from './cancel';

/**
 * Register all bot commands
 */
export function setupCommands(bot: Bot<BotContext>) {
  // Core commands
  bot.command('start', startCommand);
  bot.command('help', helpCommand);
  
  // Trading commands
  bot.command('order', orderCommand);
  bot.command('cancel', cancelCommand);
  bot.command('status', statusCommand);
  bot.command('balance', balanceCommand);
  
  // KYC/Compliance
  bot.command('kyc', kycCommand);

  // Set bot commands (shown in menu)
  bot.api.setMyCommands([
    { command: 'start', description: '🚀 Start trading' },
    { command: 'order', description: '💰 Place a new order' },
    { command: 'balance', description: '💎 Check your balances' },
    { command: 'status', description: '📊 View order status' },
    { command: 'kyc', description: '🔐 Complete KYC verification' },
    { command: 'cancel', description: '❌ Cancel an order' },
    { command: 'help', description: '❓ Show help' },
  ]);
}
