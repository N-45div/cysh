# 🚀 Quick Start Guide

## For Judges & Developers

### Prerequisites
```bash
# Check versions
node --version   # v18+
pnpm --version   # v8+
rustc --version  # 1.75+
solana --version # 1.18+
anchor --version # 0.29+
```

---

## 5-Minute Demo Setup

### Step 1: Clone & Install
```bash
git clone https://github.com/shadowotc/nexus.git
cd shadow-otc-nexus
pnpm install
```

### Step 2: Configure Environment
```bash
cp .env.example .env

# Edit .env:
SOLANA_RPC_URL=https://api.devnet.solana.com
ARCIUM_API_KEY=<get_from_arcium_dashboard>
TELEGRAM_BOT_TOKEN=<get_from_@BotFather>
MAGICBLOCK_SESSION_KEY=<get_from_magicblock>
```

### Step 3: Deploy Programs
```bash
# Build Solana programs
cd programs/arcium-matching
anchor build
anchor deploy --provider.cluster devnet

# Note the program IDs
# Update in programs/settlement/src/lib.rs
```

### Step 4: Start Bot
```bash
pnpm run bot:start

# Bot is now live!
# Open Telegram → @ShadowOTCBot
```

### Step 5: Test Trade
```
1. Open @ShadowOTCBot in Telegram
2. /start → Connect wallet
3. /order buy SOL 10 at 200
   (Creates encrypted order)
4. (Second user): /order sell SOL 10 at 200
5. Wait for match notification (~5s)
6. Automatic settlement in ~5 min batch
7. /balance to see updated funds
```

---

## Testing

### Unit Tests
```bash
pnpm run test:unit

# Tests:
# ✓ Order encryption/decryption
# ✓ Matching algorithm logic
# ✓ Settlement validity
```

### Integration Tests
```bash
pnpm run test:integration

# Tests:
# ✓ Arcium MPC order submission
# ✓ magicblock ER batching
# ✓ Solana settlement execution
# ✓ Token-2022 transfers
```

### E2E Test
```bash
pnpm run test:e2e

# Simulates:
# 1. Two users submit orders via bot
# 2. Arcium matches orders
# 3. magicblock batches settlement
# 4. Solana executes atomic swap
# 5. Balances updated
```

---

## Architecture Overview

```
┌──────────────┐
│ Telegram Bot │ ← Users interact here
└──────┬───────┘
       │
       ▼
┌──────────────┐
│   Arcium     │ ← Encrypted matching
│     MPC      │   (Orders stay private)
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  magicblock  │ ← Batched execution
│      ER      │   (Zero fees, high TPS)
└──────┬───────┘
       │
       ▼
┌──────────────┐
│    Solana    │ ← Final settlement
│  Mainnet     │   (Atomic swaps)
└──────────────┘
```

---

## Key Features Demo

### 1. Privacy
```bash
# Orders are encrypted client-side
# Only matched parties see trade details
# No public order book

curl localhost:3000/api/orderbook
# Returns: [] (empty, orders are private!)
```

### 2. MEV Resistance
```bash
# Orders batched every 5 minutes
# Uses VRF for fair ordering
# Atomic settlement prevents sandwich attacks
```

### 3. Compliance
```bash
# KYC verification required
# Transaction monitoring enabled
# Audit logs available

/admin/audit-logs
# Shows all trades with encrypted user IDs
```

---

## Troubleshooting

### Bot not responding?
```bash
# Check logs
pnpm run bot:logs

# Restart
pnpm run bot:restart
```

### Program deployment failed?
```bash
# Check Solana balance
solana balance

# Airdrop devnet SOL
solana airdrop 2

# Retry deployment
anchor deploy --provider.cluster devnet
```

### Arcium timeout?
```bash
# Check API key
echo $ARCIUM_API_KEY

# Test connection
curl https://api.arcium.com/health \
  -H "Authorization: Bearer $ARCIUM_API_KEY"
```

---

## Resources

- **Live Demo**: https://devnet.shadowotc.xyz
- **Telegram Bot**: @ShadowOTCBot
- **Documentation**: https://docs.shadowotc.xyz
- **GitHub**: https://github.com/shadowotc/nexus

---

## Next Steps

1. ✅ Run the demo
2. 📖 Read [TECHNICAL_STACK.md](./TECHNICAL_STACK.md)
3. 🏗️ Check [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md)
4. 🎯 Review [README.md](./README.md) for full details

---

**Ready to build privacy-first OTC on Solana? Let's go! 🚀**
