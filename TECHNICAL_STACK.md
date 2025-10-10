# Technical Stack Deep Dive

## Architecture Integration Map

### 🔐 **Arcium Integration - Privacy Layer**

#### What Arcium Provides
- **Decentralized MPC Network**: Process encrypted data without decryption
- **MXE Programs**: Multi-Party eXecution environment (extends Anchor)
- **Solana-Native**: On-chain coordination via Solana programs
- **Public Testnet**: Ready to use for development

#### Our Implementation
```
User Order → Encrypt Client-Side → Arcium MXE Program → Match Orders (Encrypted)
```

**Key Functions**:
1. `submit_encrypted_order()` - Store encrypted order in Arcium
2. `match_orders_confidential()` - Run matching algorithm on encrypted data
3. `reveal_match()` - Only matched parties see results

**Code Structure**:
```
programs/
  arcium-matching/
    ├── src/
    │   ├── lib.rs              # MXE entry point
    │   ├── matching.rs         # Confidential matching logic
    │   └── encryption.rs       # Encryption helpers
    └── Cargo.toml              # Arcium dependencies
```

**Dependencies**:
```toml
[dependencies]
arcium-sdk = "0.1.0"
anchor-lang = "0.29.0"
solana-program = "1.18.0"
```

---

### ⚡ **magicblock Integration - Performance Layer**

#### What magicblock Provides
- **Ephemeral Rollups**: Temporary high-speed execution layer
- **TEE Support**: Trusted Execution Environment for privacy
- **VRF**: Verifiable randomness for fair ordering
- **Zero Fees**: During rollup phase (only pay on settlement)

#### Our Implementation
```
Matched Orders → ER Session → Batch (5 min) → Settle to Solana
```

**Session Flow**:
1. Create ER session for order accumulation
2. Accumulate orders in TEE (zero fees)
3. Use VRF for batch ordering (prevent manipulation)
4. Finalize batch to Solana atomically

**Code Structure**:
```
programs/
  magicblock-settlement/
    ├── src/
    │   ├── lib.rs              # ER session management
    │   ├── batching.rs         # Batch accumulation logic
    │   └── settlement.rs       # Finalization to Solana
    └── Cargo.toml
```

**SDK Usage**:
```typescript
import { EphemeralRollup } from '@magicblock/rollup-sdk';

// Create session
const session = await EphemeralRollup.createSession({
  duration: 300, // 5 minutes
  privacy: true, // Use TEE
  vrf: true      // Fair ordering
});

// Accumulate orders
await session.addTransaction(matchedOrder);

// Finalize to Solana
await session.finalize();
```

---

### ☀️ **Solana Token-2022 Integration**

#### What Token-2022 Provides
- **Confidential Transfers**: ElGamal encryption for amounts
- **ZK Proofs**: Range proofs for transfer validity
- **Metadata Extensions**: Custom token metadata

#### Our Implementation
```
Settlement → Token-2022 Transfer → User Wallet (Encrypted Balance)
```

**Transfer Flow**:
1. Escrow releases tokens post-settlement
2. Use `ConfidentialTransferMint` extension
3. Encrypt amounts with user's ElGamal public key
4. Generate ZK range proof (amount > 0, no overflow)

**Code Example**:
```rust
use spl_token_2022::{
    extension::confidential_transfer::*,
    instruction::confidential_transfer_transfer,
};

pub fn settle_confidential(
    ctx: Context<SettleConfidential>,
    encrypted_amount: ElGamalCiphertext,
    proof: ValidityProof,
) -> Result<()> {
    // Verify proof
    verify_transfer_proof(&proof)?;
    
    // Execute confidential transfer
    confidential_transfer_transfer(
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.source.to_account_info(),
        ctx.accounts.mint.to_account_info(),
        ctx.accounts.destination.to_account_info(),
        encrypted_amount,
        ctx.accounts.authority.to_account_info(),
        &[],
    )?;
    
    Ok(())
}
```

---

## System Data Flow

### Order Submission Flow
```
┌─────────────┐
│   User TG   │ 1. Create Order
│     Bot     │    {token: SOL, amount: 100, price: 200}
└──────┬──────┘
       │ 2. Encrypt with user's keypair
       ▼
┌─────────────────────┐
│  Client Encryption  │ ElGamal(order) → encrypted_order
└──────┬──────────────┘
       │ 3. Submit to Arcium
       ▼
┌─────────────────────┐
│  Arcium MXE Node 1  │ ← MPC shard 1
│  Arcium MXE Node 2  │ ← MPC shard 2
│  Arcium MXE Node 3  │ ← MPC shard 3
└──────┬──────────────┘
       │ 4. Store encrypted order
       │    (never decrypted)
       ▼
    [Order Pool]
```

### Matching Flow
```
[Order Pool]
    │
    │ 5. Arcium MXE runs matching
    ▼
┌─────────────────────────┐
│ Confidential Matching   │ 
│ Algorithm (MPC)         │
│ - Compare prices        │
│ - Match amounts         │
│ - Stay encrypted        │
└──────┬──────────────────┘
       │ 6. Match found!
       ▼
┌─────────────────────────┐
│  Match Notification     │
│  (Only parties notified)│
└──────┬──────────────────┘
       │ 7. Send to magicblock
       ▼
```

### Settlement Flow
```
┌─────────────────────────┐
│ magicblock ER Session   │
│ - Accumulate matches    │
│ - Wait 5 min or 100 txs │
└──────┬──────────────────┘
       │ 8. Batch ready
       ▼
┌─────────────────────────┐
│  VRF Ordering           │ ← Fair execution order
└──────┬──────────────────┘
       │ 9. Execute batch
       ▼
┌─────────────────────────┐
│  Solana Settlement      │
│  - Atomic swaps         │
│  - Token-2022 transfers │
│  - Update balances      │
└──────┬──────────────────┘
       │ 10. Complete!
       ▼
┌─────────────────────────┐
│  User Wallets Updated   │
│  (Confidential balance) │
└─────────────────────────┘
```

---

## Performance Metrics

### Expected Performance
| Metric | Target | Notes |
|--------|--------|-------|
| **Order Submission** | <2s | Arcium encryption + submission |
| **Matching Latency** | <5s | MPC computation time |
| **Batch Accumulation** | 5 min | magicblock ER session |
| **Settlement Time** | <30s | Solana finalization |
| **Total Time** | ~6 min | End-to-end (order → settlement) |
| **Throughput** | 1000+ orders/batch | Limited by ER capacity |
| **Privacy Guarantee** | 100% | Orders never decrypted |

### Cost Analysis
| Component | Cost | Notes |
|-----------|------|-------|
| **Arcium MPC** | ~$0.01/order | MPC computation fee |
| **magicblock ER** | $0/tx | Zero fees during rollup |
| **Solana Settlement** | ~$0.00001 | Per transaction |
| **Token-2022 Transfer** | ~$0.00001 | Confidential transfer |
| **Total Cost** | ~$0.01/order | Pass to users as 0.3% fee |

---

## Security Model

### Trust Assumptions
1. **Arcium MPC**: Trust in N-of-M security (no single node sees data)
2. **magicblock TEE**: Trust in Intel SGX enclaves
3. **Solana**: Trust in validator consensus
4. **Token-2022**: Trust in ElGamal + ZK proof security

### Attack Resistance
| Attack Vector | Mitigation |
|---------------|------------|
| **Order Front-Running** | ✅ Encrypted until matched |
| **MEV Sandwich** | ✅ Batched atomic settlement |
| **Oracle Manipulation** | ✅ Use Pyth with staleness checks |
| **Reentrancy** | ✅ Anchor checks-effects-interactions |
| **Sybil** | ✅ KYC + minimum trade size |
| **Collusion** | ✅ MPC threshold (5/9 nodes) |

### Privacy Guarantees
- **Pre-Match**: Order details encrypted (Arcium MPC)
- **During Match**: Computation on encrypted data
- **Post-Match**: Only matched parties see trade
- **Settlement**: Token-2022 hides amounts
- **On-Chain**: No order book visible

---

## Development Environment

### Required Tools
```bash
# Solana
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
cargo install --git https://github.com/coral-xyz/anchor anchor-cli

# Arcium
npm install -g @arcium/cli
arcium init

# magicblock
npm install @magicblock/rollup-sdk

# Telegram Bot
npm install grammy
```

### Environment Variables
```bash
# .env
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_WALLET_PATH=~/.config/solana/id.json
ARCIUM_API_KEY=your_arcium_key
MAGICBLOCK_SESSION_KEY=your_session_key
TELEGRAM_BOT_TOKEN=your_bot_token
DATABASE_URL=postgresql://localhost/shadowotc
```

---

## Testing Strategy

### Unit Tests
- Arcium MXE matching logic
- Solana program instructions
- Token-2022 transfer validity

### Integration Tests
```bash
# Test full flow
pnpm run test:integration

# Covers:
# 1. Order submission → Arcium
# 2. Encrypted matching
# 3. Batch accumulation → magicblock
# 4. Settlement → Solana
# 5. Token-2022 transfer
```

### Load Tests
```bash
# Simulate 1000 orders
pnpm run test:load

# Metrics:
# - Orders/second
# - Matching latency
# - Settlement success rate
```

---

## Deployment Pipeline

### Devnet Deployment (Week 2)
```bash
# 1. Deploy Arcium MXE
arcium deploy --network devnet

# 2. Deploy Solana programs
anchor build
anchor deploy --provider.cluster devnet

# 3. Initialize magicblock session
magicblock init --network devnet

# 4. Start Telegram bot
pnpm run bot:start
```

### Mainnet Preparation (Post-Hackathon)
- Security audits (OtterSec, Neodyme)
- Stress testing (10K+ orders)
- Monitoring setup (Datadog, Sentry)
- Incident response plan

---

## API Specifications

### Telegram Bot Commands
```
/start          - Welcome & wallet connect
/order          - Create new order
/cancel <id>    - Cancel pending order
/balance        - View escrow balance
/history        - Trade history
/status <id>    - Order status
/help           - Command reference
```

### REST API (Future)
```
POST   /api/v1/orders           # Submit order
GET    /api/v1/orders/:id       # Get order status
DELETE /api/v1/orders/:id       # Cancel order
GET    /api/v1/matches          # List matches
POST   /api/v1/settle/:matchId  # Settle match
```

---

## Monitoring & Observability

### Key Metrics
- Orders submitted/hour
- Matching success rate
- Average matching time
- Settlement failures
- Gas costs per batch
- User satisfaction (NPS)

### Alerts
- Settlement failure (critical)
- Arcium MPC timeout (warning)
- magicblock ER session failure (critical)
- High gas prices (info)

---

## Compliance & Regulatory

### KYC/AML Integration
- Sumsub integration (post-MVP)
- Minimum $10K trade size (reduces retail risk)
- Transaction monitoring (Chainalysis)
- Sanctions screening (OFAC)

### Audit Logs
```typescript
interface AuditLog {
  timestamp: Date;
  userId: string;        // Hashed for privacy
  action: 'ORDER' | 'MATCH' | 'SETTLE';
  orderHash: string;     // Encrypted order ID
  matchHash?: string;    // Encrypted match ID
  complianceCheck: boolean;
}
```

### Regulatory Compliance
- Not a securities exchange (OTC facilitation)
- KYC-gated access (vs Tornado Cash)
- Transaction limits ($500K demo, $10M production)
- Audit trail for regulators

---

## Resources & References

### Documentation
- [Arcium Developer Docs](https://docs.arcium.com/developers)
- [magicblock ER Guide](https://docs.magicblock.gg/)
- [Solana Token-2022](https://spl.solana.com/token-2022)
- [Anchor Book](https://book.anchor-lang.com/)

### Community
- Arcium Discord: [discord.com/invite/arcium]
- magicblock Discord: [discord.com/invite/zHFtdVMA6e]
- Solana Discord: [discord.gg/solana]

### Research Papers
- MPC for Dark Pools (Renegade whitepaper)
- Confidential Transfers on Solana (SPL docs)
- Ephemeral Rollups (magicblock whitepaper)

---

**Last Updated**: October 10, 2025  
**Version**: 1.0.0 (MVP)
