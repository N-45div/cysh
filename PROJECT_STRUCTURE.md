# Shadow OTC Nexus - Project Structure

## Directory Layout

```
shadow-otc-nexus/
├── README.md                          # Main documentation
├── TECHNICAL_STACK.md                 # Technical deep dive
├── package.json                       # Monorepo root
│
├── programs/                          # Solana Programs (Anchor)
│   ├── arcium-matching/              # Arcium MXE Program
│   │   └── src/
│   │       ├── lib.rs                # Program entry
│   │       ├── instructions/         # Submit, match, cancel orders
│   │       └── matching/             # Confidential matching logic
│   │
│   ├── settlement/                   # Solana Settlement Program
│   │   └── src/
│   │       ├── lib.rs
│   │       └── instructions/         # Deposit, settle, withdraw
│   │
│   └── compliance/                   # KYC/Compliance Program
│       └── src/
│           └── instructions/         # Register, verify KYC
│
├── app/                              # Applications
│   ├── telegram-bot/                 # Telegram Bot (Main UI)
│   │   └── src/
│   │       ├── commands/             # /start, /order, /balance, etc.
│   │       ├── services/             # Arcium, Solana, encryption
│   │       └── utils/                # Validators, formatters
│   │
│   └── dashboard/                    # Compliance Dashboard (Future)
│       └── src/                      # Next.js app
│
├── packages/                         # Shared Packages
│   ├── sdk/                          # TypeScript SDK
│   │   └── src/
│   │       ├── arcium/               # Arcium MPC client
│   │       ├── magicblock/           # ER session management
│   │       └── solana/               # Program clients
│   │
│   ├── database/                     # Database Package
│   │   └── prisma/
│   │       └── schema.prisma         # Orders, users, matches
│   │
│   └── config/                       # Shared constants
│
├── tests/                            # Testing
│   ├── unit/                         # Unit tests
│   ├── integration/                  # Integration tests
│   └── e2e/                          # End-to-end tests
│
└── scripts/                          # Deployment scripts
    ├── deploy-programs.sh
    └── setup-devnet.sh
```

---

## Key Technologies by Layer

| Layer | Technology | Files |
|-------|-----------|-------|
| **Privacy** | Arcium MPC | `programs/arcium-matching/` |
| **Performance** | magicblock ER | `packages/sdk/src/magicblock/` |
| **Settlement** | Solana + Anchor | `programs/settlement/` |
| **Token Privacy** | Token-2022 | `packages/sdk/src/solana/token22.ts` |
| **User Interface** | Telegram Bot | `app/telegram-bot/` |
| **Database** | PostgreSQL + Prisma | `packages/database/` |

---

## Quick Start

```bash
# Install
pnpm install

# Build programs
anchor build && anchor deploy --provider.cluster devnet

# Start bot
pnpm run bot:start

# Test
pnpm run test
```

---

## Database Schema

```prisma
model User {
  id            String    @id
  telegramId    String    @unique
  walletAddress String    @unique
  kycVerified   Boolean   @default(false)
  orders        Order[]
}

model Order {
  id            String      @id
  userId        String
  encryptedData Bytes       // Arcium encrypted
  status        OrderStatus // PENDING, MATCHED, SETTLED
  createdAt     DateTime    @default(now())
}

model Match {
  id          String   @id
  buyOrderId  String
  sellOrderId String
  price       Decimal
  amount      Decimal
  settledTx   String?  // Solana tx signature
}
```

---

## Development Workflow

1. **Programs**: Write Anchor programs → Deploy to devnet
2. **SDK**: Build TypeScript SDK → Publish locally
3. **Bot**: Implement TG commands → Test with real wallet
4. **Test**: E2E tests → Verify full flow
5. **Demo**: Record video → Submit to hackathon
