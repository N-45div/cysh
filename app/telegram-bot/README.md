# Shadow OTC Telegram Bot

Privacy-first OTC trading interface for Solana.

## Quick Start

```bash
# Install dependencies
pnpm install

# Run in development mode
pnpm dev

# Build for production
pnpm build
pnpm start
```

## Environment Setup

Required variables in root `.env`:
- `TELEGRAM_BOT_TOKEN` - Get from @BotFather
- `DATABASE_URL` - PostgreSQL connection string
- `SOLANA_RPC_URL` - Solana RPC endpoint
- `ARCIUM_CLUSTER_OFFSET` - Your Arcium cluster (default: 4040404)
- `MAGICBLOCK_ROUTER_URL` - magicblock router endpoint

## Commands

- `/start` - Connect wallet and register
- `/order [buy|sell] [token] [amount] at [price]` - Place order
- `/balance` - Check wallet balances
- `/status` - View order status
- `/kyc` - Complete KYC verification
- `/cancel` - Cancel pending action
- `/help` - Show help

## Architecture

```
src/
├── index.ts              # Bot entry point
├── commands/             # Command handlers
├── handlers/             # Callback query handlers
├── middleware/           # Logging, error handling
├── services/             # Arcium, magicblock clients
├── config/               # Environment validation
└── lib/                  # Prisma, utilities
```

## Integration Points

- **Arcium**: Encrypted order matching via SDK
- **magicblock**: Transaction batching via Router
- **Prisma**: User/order tracking in PostgreSQL
- **Solana**: On-chain settlement

## Next Steps for Developer

1. Implement wallet connection flow (Phantom deep link)
2. Wire up Arcium order submission in `order-submission.ts`
3. Add webhook for match notifications
4. Implement SPL token balance fetching
5. Add KYC provider integration
6. Setup production webhook mode
