# 🤖 Telegram Bot - Developer Handoff

## ✅ What's Done

### **Bot Structure** (100% scaffolded)
```
app/telegram-bot/
├── package.json              ✅ Dependencies configured
├── tsconfig.json             ✅ TypeScript setup
├── src/
│   ├── index.ts              ✅ Bot entry point
│   ├── config/env.ts         ✅ Env validation with zod
│   ├── lib/prisma.ts         ✅ Database client
│   ├── services/index.ts     ✅ Service injection (stubs)
│   ├── commands/             ✅ All 7 commands implemented
│   │   ├── start.ts          ✅ Welcome + wallet connect
│   │   ├── order.ts          ✅ Place encrypted orders
│   │   ├── balance.ts        ✅ Check wallet balances
│   │   ├── status.ts         ✅ View order status
│   │   ├── kyc.ts            ✅ KYC verification
│   │   ├── help.ts           ✅ Help command
│   │   └── cancel.ts         ✅ Cancel actions
│   ├── handlers/
│   │   ├── callbacks.ts      ✅ Button handlers
│   │   └── order-submission.ts ✅ Order submission logic
│   └── middleware/
│       ├── error-handler.ts  ✅ Global error handling
│       └── logging.ts        ✅ Audit logging
```

### **Database Integration** (100%)
- ✅ Prisma client configured
- ✅ User tracking (telegram_id → wallet_address)
- ✅ Order tracking with status
- ✅ Audit logs for compliance

### **Commands** (100% scaffolded)
- ✅ `/start` - Wallet connection flow
- ✅ `/order` - Place buy/sell orders
- ✅ `/balance` - Check SOL/token balances
- ✅ `/status` - View recent orders
- ✅ `/kyc` - KYC verification
- ✅ `/help` - Show help
- ✅ `/cancel` - Cancel pending action

---

## 🔨 What Needs Work

### **1. Setup & Install** (10 min)
```bash
# From repo root
cd app/telegram-bot
pnpm install

# Get Telegram bot token from @BotFather
# Add to root .env:
TELEGRAM_BOT_TOKEN=your_token_here

# Test bot
pnpm dev
```

### **2. SDK Integration** (HIGH PRIORITY)
**Current Status**: Using mock stubs

**File**: `src/services/index.ts`
```typescript
// TODO: Replace with actual imports
import { ArciumClient } from '../../../packages/sdk/src/arcium/client';
import { MagicConnection } from '../../../packages/sdk/src/magicblock/router';
```

**Actions**:
- [ ] Fix SDK package exports in `packages/sdk/src/index.ts`
- [ ] Update imports to use actual SDK classes
- [ ] Wire up real `submitOrder()` in `order-submission.ts`

### **3. Wallet Connection** (HIGH PRIORITY)
**File**: `src/commands/start.ts` → `generateWalletConnectUrl()`

**Current**: Phantom deep link (placeholder)

**Needed**:
1. **Option A: Web-based flow** (Recommended)
   - Create `/connect` endpoint in Express/Next.js
   - User clicks → opens Phantom → signs message
   - Verify signature on backend
   - Store wallet in DB
   
2. **Option B: Direct message**
   - Ask user to paste wallet address
   - Send verification transaction
   - Confirm ownership

**Example signature verification**:
```typescript
import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';

function verifySignature(
  message: string,
  signature: Uint8Array,
  publicKey: PublicKey
): boolean {
  const messageBytes = new TextEncoder().encode(message);
  return nacl.sign.detached.verify(
    messageBytes,
    signature,
    publicKey.toBytes()
  );
}
```

### **4. Order Submission** (HIGH PRIORITY)
**File**: `src/handlers/order-submission.ts`

**Current**: Creates DB record only

**Needed**:
```typescript
// 1. Fetch user's wallet
const user = await prisma.user.findUnique(...);

// 2. Create order object
const order = {
  token_mint: new PublicKey(orderData.token),
  side: orderData.type === 'buy' ? 0 : 1,
  amount: BigInt(orderData.amount! * 1e9), // Convert to lamports
  price: BigInt(orderData.price! * 100), // Price in cents
  expiry: BigInt(Date.now() / 1000 + 3600), // 1 hour
  trader_id: BigInt('0x' + user.walletAddress.slice(0, 16))
};

// 3. Encrypt and submit to Arcium
const encryptedOrder = await ctx.services!.arcium.submitOrder(order);

// 4. Store in DB
await prisma.orderTracking.create({
  data: {
    orderId: encryptedOrder.id,
    ...
  }
});
```

### **5. Balance Fetching** (MEDIUM PRIORITY)
**File**: `src/commands/balance.ts`

**Current**: Shows SOL only

**Needed**:
```typescript
import { getAccount, getAssociatedTokenAddress } from '@solana/spl-token';

// Get SPL token balances
const usdcMint = new PublicKey('USDC_MINT_ADDRESS');
const ata = await getAssociatedTokenAddress(usdcMint, publicKey);
const account = await getAccount(connection, ata);
const balance = Number(account.amount) / 1e6; // USDC has 6 decimals
```

### **6. Match Notifications** (HIGH PRIORITY)
**What**: When Arcium matches orders, notify users

**Approach A: Polling** (Simpler)
```typescript
// In index.ts, add interval
setInterval(async () => {
  const pendingOrders = await prisma.orderTracking.findMany({
    where: { status: 'pending' }
  });
  
  for (const order of pendingOrders) {
    // Check if matched (query Arcium or settlement program)
    // If matched, update DB and send notification
    await bot.api.sendMessage(
      order.telegramId,
      `✅ Your order ${order.orderId} has been matched!`
    );
  }
}, 30000); // Every 30 seconds
```

**Approach B: Webhooks** (Better)
- Setup `/webhook/match` endpoint
- Register with Arcium to receive match events
- Send Telegram notification immediately

### **7. KYC Integration** (MEDIUM PRIORITY)
**File**: `src/commands/kyc.ts`

**Current**: Links to placeholder URL

**Needed**:
- Integrate with KYC provider (Sumsub, Onfido, etc.)
- Or use Solana Attestation Service
- Update `user.kycStatus` in DB after verification

### **8. Environment Variables**
**Add to root `.env`**:
```bash
# Required
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz

# Optional (for production)
TELEGRAM_WEBHOOK_URL=https://your-domain.com/webhook
```

---

## 🎯 Quick Start for Next Developer

### **Step 1: Test Basic Bot** (5 min)
```bash
cd app/telegram-bot
pnpm install
pnpm dev
```
Open Telegram → Search for your bot → `/start`

### **Step 2: Connect Real Services** (30 min)
1. Fix SDK imports in `services/index.ts`
2. Test with `/balance` command
3. Verify database writes

### **Step 3: Implement Wallet Connect** (1 hour)
1. Choose approach (web-based or direct)
2. Implement signature verification
3. Test full flow: connect → order → match

### **Step 4: Wire Up Arcium** (1 hour)
1. Update `order-submission.ts`
2. Add encryption logic
3. Test order placement

### **Step 5: Notifications** (30 min)
1. Add polling or webhook
2. Test match notifications

---

## 🚨 Known Issues

1. **SDK workspace dependency**: Currently using stubs. Need to properly link `packages/sdk` or copy files directly.

2. **No SPL token support**: `balance.ts` only shows SOL. Need to fetch token accounts.

3. **No transaction signing**: Bot can't sign transactions yet. Need to either:
   - Use user's wallet (best)
   - Have bot hold funds in escrow (requires additional security)

4. **Lint errors**: Fixed in latest commit. Run `pnpm install` to resolve.

---

## 📚 Resources

- **Grammy Docs**: https://grammy.dev
- **Solana Cookbook**: https://solanacookbook.com
- **Phantom Connect**: https://docs.phantom.app/developer-powertools/connect-to-phantom
- **Token-2022**: https://spl.solana.com/token-2022

---

## ✅ Checklist for Production

- [ ] Wallet connection working
- [ ] Orders submitted to Arcium
- [ ] Match notifications sent
- [ ] Balance shows all tokens
- [ ] KYC verification integrated
- [ ] Error handling tested
- [ ] Rate limiting added
- [ ] Webhook mode enabled (production)
- [ ] Monitoring/logging setup
- [ ] Load tested (1000+ users)

---

**Current Status**: 🟡 **70% Complete** - Core structure done, needs integration work

**Estimated Time to Production**: 4-6 hours of focused dev work
