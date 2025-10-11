# 🚀 Database Quick Start (5 Minutes)

## Step 1: Choose Your Database

### Option A: Supabase (Recommended - Zero Setup)

1. Go to [supabase.com](https://supabase.com) and sign up
2. Create new project: **shadow-otc-nexus**
3. Copy your database URL from Settings → Database
4. Done! ✅

### Option B: Local PostgreSQL

```bash
# Using Docker (easiest)
docker run --name shadowotc-db \
  -e POSTGRES_PASSWORD=dev_password \
  -e POSTGRES_DB=shadowotc \
  -p 5432:5432 \
  -d postgres:15-alpine
```

---

## Step 2: Configure Environment

```bash
# Copy example env
cp .env.example .env

# Edit .env and add your DATABASE_URL
# For Supabase:
DATABASE_URL="postgresql://postgres:[PASSWORD]@db.xxx.supabase.co:5432/postgres"

# For local:
DATABASE_URL="postgresql://postgres:dev_password@localhost:5432/shadowotc"
```

---

## Step 3: Install Dependencies

```bash
pnpm install
```

---

## Step 4: Setup Database

```bash
# Generate Prisma client and push schema
pnpm db:setup
```

**That's it!** ✅

---

## Step 5: Test Connection

```bash
pnpm db:test
```

You should see:
```
✅ Database connected successfully!
📊 Current data:
   Users: 1
   Orders: 0
   Audit logs: 0
✅ All tests passed!
🚀 Database is ready for Shadow OTC Nexus!
```

---

## Useful Commands

```bash
# View/edit data in browser
pnpm db:studio

# Reset database (⚠️ deletes all data)
pnpm db:reset

# Create migration (for production)
pnpm db:migrate
```

---

## Using Database in Your Code

```typescript
import { db } from './database/client';
import { createUser, getUserByTelegramId } from './database/queries';

// Create user
await createUser(123456789n, 'wallet_address', 'username');

// Get user
const user = await getUserByTelegramId(123456789n);

// Track order
await db.orderTracking.create({
  data: {
    orderId: 'arcium_order_123',
    telegramId: 123456789n,
    orderType: 'buy',
    tokenPair: 'SOL/USDC',
    status: 'pending',
  },
});
```

---

## Database Schema

### Tables Created:

1. **users** - telegram_id ↔ wallet_address mapping
2. **order_tracking** - Order status for notifications
3. **audit_logs** - Compliance trail

**That's all you need!** Simple and minimal. ✅

---

## Troubleshooting

**Can't connect?**
- Check DATABASE_URL in .env
- For Supabase: verify password
- For local: ensure PostgreSQL is running

**Tables not created?**
- Run `pnpm db:setup` again
- Check Supabase dashboard → SQL Editor for errors

**Prisma client errors?**
- Run `pnpm prisma generate`
- Restart your terminal

---

**Database is ready! Now build your bot! 🤖**
