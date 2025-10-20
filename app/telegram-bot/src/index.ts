/**
 * Shadow OTC Nexus - Telegram Bot
 * 
 * Main entry point for the Telegram bot that enables privacy-first OTC trading
 */

import { Bot, Context, session, SessionFlavor } from 'grammy';
import { config } from './config/env';
import { initializeServices } from './services';
import { setupCommands } from './commands';
import { setupCallbackQueries } from './handlers/callbacks';
import { errorHandler } from './middleware/error-handler';
import { loggingMiddleware } from './middleware/logging';
import { prisma } from './lib/prisma';

// Session data structure
export interface SessionData {
  userId?: string;
  walletAddress?: string;
  pendingAction?: 'connect_wallet' | 'submit_order' | 'kyc';
  orderData?: {
    type: 'buy' | 'sell';
    token?: string;
    amount?: number;
    price?: number;
  };
}

export type BotContext = Context & SessionFlavor<SessionData> & {
  prisma: typeof prisma;
};

/**
 * Initialize and start the bot
 */
async function main() {
  console.log('🌑 Starting Shadow OTC Nexus Bot...');

  // Initialize bot with token from env
  const bot = new Bot<BotContext>(config.telegram.botToken);

  // Setup session storage
  bot.use(session({
    initial: (): SessionData => ({})
  }));

  // Setup middleware
  bot.use(loggingMiddleware);
  
  // Initialize services (Arcium, Magicblock, Solana clients)
  const services = await initializeServices();
  console.log('✅ Services initialized');

  // Inject services and prisma into context
  bot.use(async (ctx, next) => {
    ctx.services = services;
    ctx.prisma = prisma;
    await next();
  });

  // Setup all commands (/start, /order, /balance, etc.)
  setupCommands(bot);
  
  // Setup callback query handlers (inline buttons)
  setupCallbackQueries(bot);

  // Error handler (must be last)
  bot.catch(errorHandler);

  // Start match notifier
  const { startMatchNotifier } = await import('./services/match-notifier');
  const stopNotifier = startMatchNotifier(bot, 30000); // Check every 30 seconds

  // Graceful shutdown
  const stopBot = async () => {
    console.log('\n🛑 Shutting down bot...');
    stopNotifier();
    await bot.stop();
    await prisma.$disconnect();
    console.log('✅ Bot stopped gracefully');
    process.exit(0);
  };

  process.once('SIGINT', stopBot);
  process.once('SIGTERM', stopBot);

  // Health check
  const healthCheck = async () => {
    try {
      const arciumHealth = await services.arcium.healthCheck();
      const magicHealth = await services.magic.healthCheck();
      
      console.log('🏥 Health Check:');
      console.log('  Arcium:', arciumHealth.arcium ? '✅' : '❌');
      console.log('  Solana:', arciumHealth.solana ? '✅' : '❌');
      console.log('  magicblock Router:', magicHealth.router ? '✅' : '❌');
      console.log('  magicblock ER:', magicHealth.er ? '✅' : '❌');
      console.log('  Database:', await prisma.$queryRaw`SELECT 1` ? '✅' : '❌');
    } catch (err) {
      console.error('❌ Health check failed:', err);
    }
  };

  await healthCheck();

  // Start bot
  console.log('🚀 Bot is running... Press Ctrl+C to stop');
  await bot.start({
    drop_pending_updates: true,
    onStart: (botInfo) => {
      console.log(`✅ Bot started as @${botInfo.username}`);
    }
  });
}

// Run
main().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
