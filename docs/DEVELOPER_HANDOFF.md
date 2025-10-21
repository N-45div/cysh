# Shadow OTC Nexus – Developer Handoff

This document summarizes the current state of the project, what was implemented in Phase 1 (Token‑2022 atomic swaps), and what is needed to complete the Telegram bot and database layers. It is intended for the next developer to continue from here.

This plan follows the context captured in the memories titled "Phase 1: Basic Token‑2022 Transfers - COMPLETE" and "Settlement SDK Implementation - COMPLETE".

---

## 1) Repository Structure (Relevant Paths)

- `programs/settlement/`
  - `programs/settlement/Cargo.toml` – Workspace Cargo
  - `programs/settlement/programs/settlement/Cargo.toml` – Program dependencies
  - `programs/settlement/programs/settlement/src/lib.rs` – Settlement program logic
  - `programs/settlement/Anchor.toml` – Anchor config and test script
  - `programs/settlement/tests/` – Mocha/ts-node tests for program
- `packages/sdk/`
  - `src/solana/` – Token‑2022 helpers (existing)
  - `src/magicblock/` – Magicblock ER client (existing)
  - `src/arcium/` – Arcium client (existing)
  - `src/settlement/` – NEW: Settlement program TypeScript SDK client
  - `examples/settlement-flow.ts` – Example usage
- `docs/DEVELOPER_HANDOFF.md` – This document

---

## 2) Phase 1 – Token‑2022 Atomic Swaps (Complete)

### 2.1 Program Summary

File: `programs/settlement/programs/settlement/src/lib.rs`

- Removed `anchor-spl`; use direct SPL crates to avoid `solana-instruction` version conflicts.
- Dependencies (in `Cargo.toml`):
  - `anchor-lang = "0.32.1"`
  - `spl-token-2022 = { version = "9.0.0", features = ["no-entrypoint"] }`
  - `spl-associated-token-account = { version = "6.0.0", features = ["no-entrypoint"] }`
  - `solana-program = "2.3.0"`
  - `base64ct = "=1.7.3"` (pin to avoid Edition 2024 blocker)
- Key imports:
  - `use solana_program::{ program::invoke_signed, program_pack::Pack };` for `Mint::unpack()`
- Program ID (devnet): `HkamtrV1uGYGHgL8rZxmXubtnLawS3yiizCBQXCpiZds`
- PDAs:
  - `TRADE_ESCROW_SEED = b"trade_escrow"` with seeds `[TRADE_ESCROW_SEED, match_id.to_le_bytes(), bump]`
  - `BATCH_ESCROW_SEED = b"batch_escrow"` (batching available for ER integration)
- Token transfer helper:
  - `transfer_tokens()` uses `spl_token_2022::instruction::transfer_checked()` + `invoke_signed()` with PDA.
  - Reads mint decimals via `spl_token_2022::state::Mint::unpack()`.
- Instructions (high‑level):
  - `init_escrow` – initialize trade escrow state
  - `deposit` – transfer user tokens → escrow ATA; validates expected amount
  - `settle_atomic_swap` – transfers tokens escrow→counterparty ATAs via PDA signer; marks `is_settled = true`
  - `withdraw` – returns tokens escrow→user if trade canceled; validates depositor
- Borrow checker fix:
  - Extract and cache fields (`match_id`, `maker_amount`, `taker_amount`, `bump`) before transfers, then do the mutable update (`is_settled = true`).

### 2.2 Tests

Dir: `programs/settlement/tests/`

- Main test: `token22-swap.test.ts` (6 tests passing on devnet in ~33s)
- Approach:
  - Manual IDL load: `new Program(idl, provider)` to avoid test CWD `Anchor.toml` path issues.
  - Fund test users from payer wallet (not airdrop) to avoid devnet airdrop failures.
  - Create real Token‑2022 mints (USDC 6dp, SOL 9dp), create ATAs, mint tokens, run full flow.
- Test script (in `programs/settlement/Anchor.toml`):
  - `[scripts] test = "pnpm --dir tests exec ts-mocha -p ./tsconfig.json -t 1000000 token22-swap.test.ts"`
  - This focuses the suite on the Token‑2022 tests and avoids legacy mocks.

### 2.3 Deployment / Config

- `programs/settlement/Anchor.toml`:
  - `[toolchain] anchor_version = "0.32.1"`
  - `[provider] cluster = "devnet"`, `wallet = '~/.config/solana/id.json'`
- Program ID (devnet): `HkamtrV1uGYGHgL8rZxmXubtnLawS3yiizCBQXCpiZds`

---

## 3) Settlement TypeScript SDK (Complete)

Dir: `packages/sdk/src/settlement/`

- `client.ts` – `SettlementClient` with the following methods:
  - `getTradeEscrowPda(matchId)`
  - `getBatchEscrowPda(batchId)`
  - `getTokenAccount(mint, owner, allowOwnerOffCurve?)` (Token‑2022 ATAs)
  - `initEscrow(params)` → initialize escrow
  - `deposit(params)` → deposit tokens to escrow
  - `settleAtomicSwap(params)` → swap escrowed tokens
  - `withdraw(matchId, withdrawer, mint)` → cancel/return
  - `getTradeEscrow(matchId)` → fetch escrow data
  - `initializeBatch(batchId)`, `addToBatch(...)`, `finalizeBatch(batchId)` → ER batch helpers
- Types:
  - Currently uses generic `Idl` due to type‑gen constraints; account fetch calls use `as any` to access `tradeEscrow`/`batchEscrow` accounts.
  - After `anchor build`, you can switch to generated types: `programs/settlement/target/types/settlement.ts`.
- Example usage: `packages/sdk/examples/settlement-flow.ts`
  - Loads IDL, constructs `Program(idl, provider)`, then `createSettlementClient(program, provider)`.

---

## 4) Magicblock Ephemeral Rollups (ER) – Client‑Side Routing

Dir: `packages/sdk/src/magicblock/`

- Status: Client‑side routing is implemented and tested (Section 3 in TODO). On‑chain Rust ER SDK is incompatible with current Solana toolchain; we use the TypeScript SDK.
- Pattern:
  - Delegate accounts via client, run settlement instructions while delegated, undelegate post‑commit.
  - Transparent to the program logic – no ER‑specific instructions are required.
- Config: See `packages/sdk/src/magicblock/config.ts` and router.

---

## 5) Arcium MXE – Encrypted Matching (Status: ACTIVE )

- **DKG Active**: Cluster 4040404 is operational as of Oct 21, 2025
- **Node Offset**: 2390982837 (if you're operating a node)
- **Fee**: 10 ARX per compute unit (voted and approved)
- Architecture:
  - No API keys; local CLI tooling; x25519 ECDH for client‑side encryption, Solana keypair for tx signing.
  - Uses cluster offset 4040404 (configured in `packages/sdk/src/arcium/client.ts`)
- Integration points:
  - Submit encrypted orders to MXE cluster 4040404
  - Receive match results (order pairs, price, amount) – generate a `match_id` (u64) and pass into `initEscrow`
  - Persist orders/matches in DB (see schema below)
- **SDK Config**: `DEFAULT_ARCIUM_CONFIG` updated with active cluster offset
- **SDK Configuration**: `packages/sdk/src/arcium/client.ts` - `DEFAULT_ARCIUM_CONFIG.clusterOffset = 4040404`

---

## 6) Telegram Bot (Next Developer Tasks)

Goal: Provide a conversational UI for OTC trading that orchestrates orders (via Arcium) and settlement (via Settlement SDK + ER).

### 6.1 Library

- Recommend `grammy` or `telegraf` for bot framework.
- For production signing, use a WebApp (Telegram Mini App) to connect user wallets (Phantom/Backpack); bot alone cannot sign user transactions.

### 6.2 Core Flows

- **/start**
  - Create user record if not exists, set `kycStatus` placeholder (see DB).
  - Greet + show available commands.

- **/kyc**
  - MVP: Toggle stub status in DB (`User.kycStatus = APPROVED/REJECTED/PENDING`).

- **/order** (guided form)
  - Collect: side (BUY/SELL), `token_mint`, `amount`, `price`, `expiry`.
  - If Arcium cluster is available: encrypt order and submit to MXE.
  - If Arcium unavailable: store in DB as `OPEN` and simulate matching for demos.

- **/status**
  - Show user's open/matched/settled orders.

- **Settlement Instructions** (post‑match)
  - When matched, bot provides deposit instructions:
    - Derive escrow PDA: `getTradeEscrowPda(matchId)`
    - Show escrow ATA addresses for both tokens (Token‑2022 ATAs under escrow PDA)
    - If you build a WebApp dApp, you can trigger `deposit()` by asking the user’s wallet to sign.
  - Bot monitors deposits (chain watcher), and when both deposited, calls `settleAtomicSwap()` using the authority wallet.

- **Withdraw/Cancel**
  - If trade canceled before settlement: call `withdraw()` for the depositor.

### 6.3 Services & Watchers

- **Deposit watcher**
  - Poll ATAs for escrow PDA; update DB flags `makerDeposited`/`takerDeposited`.
- **Settlement trigger**
  - When both deposited and not settled → call `settleAtomicSwap()`; store tx sig and update DB.
- **Arcium integration**
  - Subscribe to match events when DKG recovers; materialize into DB and notify both parties via bot.

### 6.4 Wallets and Signing

- Bot cannot sign for users; integrate a WebApp flow for user‑signed deposits.
- Authority operations (initEscrow, settle) can be signed by the backend service wallet set in `Anchor.toml`.

---

## 7) Database (Next Developer Tasks)

Recommend: Postgres + Prisma.

### 7.1 Suggested Schema (first pass)

- **User**
  - `id` (uuid, pk)
  - `telegram_id` (string, unique)
  - `wallet_pubkey` (string, nullable initially)
  - `kycStatus` (enum: PENDING, APPROVED, REJECTED)
  - `created_at`, `updated_at`

- **Order**
  - `id` (uuid, pk)
  - `user_id` (fk User)
  - `side` (enum: BUY, SELL)
  - `token_mint` (string)
  - `amount` (numeric or bigint string)
  - `price` (numeric or bigint string)
  - `expiry` (timestamp, nullable)
  - `status` (enum: OPEN, MATCHED, CANCELLED, SETTLED)
  - `match_id` (bigint, nullable)
  - `created_at`, `updated_at`

- **Match**
  - `id` (uuid, pk)
  - `match_id` (bigint, unique)
  - `maker_order_id` (fk Order)
  - `taker_order_id` (fk Order)
  - `matched_amount` (numeric)
  - `agreed_price` (numeric)
  - `created_at`

- **TradeEscrow** (mirror on‑chain state for convenience)
  - `match_id` (bigint, pk)
  - `escrow_pda` (string)
  - `maker` (string)
  - `taker` (string)
  - `maker_token` (string)
  - `taker_token` (string)
  - `maker_amount` (numeric)
  - `taker_amount` (numeric)
  - `maker_deposited` (boolean)
  - `taker_deposited` (boolean)
  - `is_settled` (boolean)
  - `bump` (int)
  - `created_at`, `updated_at`

- **SettlementBatch** (for ER batching)
  - `id` (uuid, pk)
  - `batch_id` (bigint, unique)
  - `status` (enum: OPEN, COMMITTED)
  - `commit_tx` (string, nullable)
  - `created_at`, `updated_at`

- **AuditLog**
  - `id` (uuid, pk)
  - `type` (enum: ORDER, MATCH, DEPOSIT, WITHDRAW, SETTLE, BATCH_COMMIT)
  - `details` (JSONB) – consistent schema recommended
  - `user_id` (fk User, nullable)
  - `tx_signature` (string, nullable)
  - `created_at`

### 7.2 Indices & Notes

- Index `Order.status`, `Order.user_id`, `Order.match_id`
- Index `Match.match_id`
- Index `TradeEscrow.match_id`
- Hash public identifiers where necessary for privacy; store unhashed only when needed for operations.

### 7.3 Event Logging (recommended)

- Log `ORDER` (create/update/cancel)
- Log `MATCH` (from Arcium)
- Log `DEPOSIT`/`WITHDRAW` with token account addresses and amounts
- Log `SETTLE` with both receive ATAs and tx signature
- Log `BATCH_COMMIT` when ER commits

---

## 8) Orchestration Notes

- **When Arcium DKG is down**: temporarily simulate matching in backend for demos (pair compatible orders by price/time, create `match_id`).
- **Escrow lifecycle**:
  1) `initEscrow()` by authority with `match_id`
  2) Users deposit to escrow ATAs (user‑signed)
  3) Service monitors deposits
  4) `settleAtomicSwap()` by authority
  5) Update DB + notify via bot
- **Error handling**: implement retry/backoff on RPC + ER calls; persist pending states in DB to resume after outages.

---

## 9) Configuration & Env

- Program ID (devnet): `HkamtrV1uGYGHgL8rZxmXubtnLawS3yiizCBQXCpiZds`
- Anchor provider wallet: `~/.config/solana/id.json`
- RPC: use a stable devnet RPC provider (consider Alchemy/Helius to avoid rate limits)
- IDL path for SDK/examples: `programs/settlement/target/idl/settlement.json`
- PNPM workspace: root has `pnpm-workspace.yaml` including `programs/*` and `packages/*`

---

## 10) How to Run

- Build program (if needed):
```bash
anchor build
```

- Run Token‑2022 integration tests (from `programs/settlement/`):
```bash
anchor test --skip-build --skip-deploy
```

- Run the SDK example (after building the program to generate IDL):
```bash
pnpm ts-node packages/sdk/examples/settlement-flow.ts
```

---

## 11) Roadmap / Next Steps

- **Telegram Bot**
  - Implement core commands (/start, /kyc, /order, /status)
  - Implement WebApp for wallet connect and user‑signed deposits
  - Add watchers and notifications for match/deposit/settle
- **Database**
  - Implement Prisma schema per Section 7
  - Add repository/services for Orders, Matches, Escrows, Batches, Audit
  - Add background workers (deposit watcher, settlement trigger)
- **Arcium**
  - Integrate real encrypted order submission when DKG resumes
  - Subscribe to match events and backfill DB + notify users
- **Privacy Enhancements** (optional, pragmatic)
  - Stealth addresses for settlement (ephemeral per trade)
  - Batch obfuscation with ER (include decoy trades when possible)
- **Token‑2022 Confidential Transfers** (optional, advanced)
  - Add ElGamal key mgmt and ZK proofs if business requires amount privacy

---

## 12) Tips & Pitfalls

- Prefer manual `Program(idl, provider)` in tests/services to avoid `Anchor.toml` CWD issues.
- Avoid devnet airdrops in CI; fund from a known payer wallet.
- Token‑2022 ATAs must use `TOKEN_2022_PROGRAM_ID`.
- When using `transfer_checked`, always read mint decimals from on‑chain `Mint` (`Pack::unpack`).
- For ER: keep it client‑side until Rust SDK compatibility issues are resolved.
- For Arcium: no API keys; ensure local CLI and cluster config are present; store cluster offset.

---

## 13) Contacts / Handoff

- Program ID (devnet): `HkamtrV1uGYGHgL8rZxmXubtnLawS3yiizCBQXCpiZds`
- Primary areas ready: Settlement program, Token‑2022 flow, SDK
- Areas to build: Telegram bot UI, Database, Orchestration

Good luck! This codebase is ready for productization once the app layer is in place.
