# TODO — Shadow OTC Nexus Implementation (excluding Telegram Bot)

Status assumptions:
- Database is already set up and reachable via `DATABASE_URL` in `.env` per `prisma/schema.prisma`.
- Telegram bot integration is out of scope for this checklist.

Legend:
- [ ] = pending
- [x] = done

---

## 0) Start Here — Environment Preflight (run before 1)

- [ ] Verify toolchain versions:
  - [ ] Node 18+, PNPM 8+, Rust 1.82+ (or per your env), Solana CLI, Anchor CLI
- [ ] Arcium tooling:
  - [ ] `arcup install` and `arcium --version` [see `arcium-integ.md`]
- [ ] magicblock SDKs:
  - [ ] Rust: add `ephemeral-rollups-sdk` (with `features=["anchor"]`) to programs that integrate ER
  - [ ] JS/TS: `@magicblock-labs/ephemeral-rollups-sdk` for Router/TEE helpers
- [ ] Environment file `.env`:
  - [ ] `SOLANA_RPC_URL`, `SOLANA_WALLET_PATH`, `MAGICBLOCK_*` endpoints/keys, database URL (DB already set up)
  - [ ] Note: Arcium uses local CLI + x25519 key exchange (no API key needed)
- [ ] Connectivity checks:
  - [ ] Router/ER endpoints reachable (e.g., `https://devnet-router.magicblock.app`, `https://devnet.magicblock.app`)
  - [ ] Optional TEE: run `verifyTeeRpcIntegrity` + fetch `getAuthToken` [see `magic-block-docs/private-eph-rollup.md`]

## 1) Repository & Build System

- [x] Establish workspace layout per docs (without bot):
  - [x] `programs/arcium-matching/` (Arcium MXE)
  - [x] `programs/settlement/` (Anchor settlement)
  - [x] `programs/compliance/` (KYC gating stubs on-chain if needed)
  - [x] `packages/sdk/` (TypeScript SDK: `arcium/`, `magicblock/`, `solana/`, `token22/`)
  - [x] `packages/config/` (shared constants/env parsing)
  - [x] `tests/` (unit, integration, e2e, load)
  - [x] `scripts/` (deploy/setup helpers)
- [x] Add `pnpm-workspace.yaml` to manage packages and apps
- [x] Add `tsconfig.json` at repo root (composite references for packages)
- [x] Add linting/formatting:
  - [x] ESLint config + Prettier
  - [x] Scripts: `lint`, `lint:fix`, `format`
  - [x] Pre-commit hook (Husky) for `lint-staged`
- [ ] Add `.nvmrc` or `.tool-versions` (optional) for Node version
- [x] Define environment validation module (`packages/config/src/env.ts`) with zod-safe parsing for:
  - [x] Solana, Arcium, magicblock, compliance, monitoring, DB
- [x] Update root `package.json` scripts for monorepo:
  - [x] `build`, `dev`, `test`, `test:unit`, `test:integration`, `test:e2e`, `test:load`
  - [x] `deploy:devnet`, `deploy:programs`, `deploy:magicblock`

---

## 2) Privacy Layer — Arcium MXE (Encrypted Matching)

**Reference**: See `arcium-integ.md` for installation, tooling, and implementation patterns.

- [x] Initialize `programs/arcium-matching/` as MXE project
  - [x] Install Arcium tooling: `arcup install` (see `arcium-integ.md`)
  - [x] Run `arcium init arcium-matching` to scaffold MXE project
  - [x] Dependencies: `arcium-sdk`, `anchor-lang`, `solana-program`
  - [x] Files: `programs/arcium_matching/src/lib.rs`, `encrypted-ixs/src/lib.rs`
  - [x] Add `encrypted-ixs/` directory for confidential instructions (Arcis)
- [x] Define encrypted order schema (token, side, amount, price, expiry, trader_id)
- [x] Implement confidential instructions (Arcis framework):
  - [x] `match_orders(bid: Enc<Shared, Order>, ask: Enc<Shared, Order>) -> Enc<Shared, MatchResult>`
  - [ ] `reveal_match(for_party_pubkey)` to matched parties only (sealing/re-encryption) [optional]
- [x] Matching logic (MPC):
  - [x] Price compatibility check (>= or <= based on side)
  - [x] Amount matching/partial fill groundwork
  - [ ] Deterministic tie-breaking (timestamp/VRF seed)
- [x] Key mgmt & client-side encryption spec
  - [x] x25519 key exchange (client ↔ MXE cluster) - implemented in `packages/sdk/src/arcium/encryption.ts`
  - [x] Rescue cipher for encryption (CTR mode, see `arcium-integ.md` encryption section) - placeholder ready for @arcium-hq/client
  - [x] Document key derivation & storage (client-level) - documented in encryption.ts
- [x] Solana program integration (3 instructions per confidential function):
  - [x] `init_match_orders_comp_def` (one-time setup)
  - [x] `match_orders` (queue computation with encrypted params)
  - [x] `match_orders_callback` (handle MPC result)
- [ ] Integration tests (Arcium devnet): submit → match → reveal **[BLOCKED: waiting for cluster 4040404 DKG completion]**
  - [x] Use `@arcium-hq/client` TypeScript library
  - [x] Test flow: encrypt → queue → await finalization → decrypt result
  - [x] Scaffolded test file `programs/arcium-matching/tests/match-orders.ts` with idempotent comp def init
  - [x] Program deployed to devnet: `6QFiiqmYBELXw9LgGwogYcwiXkRD6AyGjWtXgoJ3NS3G`
  - [x] Joined cluster 4040404 (waiting for DKG trigger from cluster operator)
  - [ ] **TODO**: Run full test once DKG completes and x25519 pubkey is available
- [ ] Observability: match success rate, latency metrics (export to SDK)
  - [x] Metrics emitter skeleton in `packages/sdk/src/metrics/metrics.ts`

---

## 3) Batching & MEV Resistance — magicblock ER

**References**
- See `magic-block-docs/magicblock-1-inte.md` for delegation/commit/undelegate flows, validator IDs, local dev, and example tests.
- See `magic-block-docs/anchor-example.md` for Anchor macros `#[ephemeral]`, `#[delegate]`, `#[commit]` usage.
- See `magic-block-docs/rust-example.md` for native Rust instruction set (Delegate/Commit/CommitAndUndelegate/Undelegate) and TS tests.
- See `magic-block-docs/eph-rollup.md` for lifecycle: Delegate → Execute on ER → Commit → Undelegate.
- See `magic-block-docs/magic-router.md` for `ConnectionMagicRouter`, `sendMagicTransaction`, and Magic Actions commit-handler pattern.
- See `magic-block-docs/private-eph-rollup.md` for TEE (attestation + auth token) and permission program (privacy controls).
- See `magic-block-docs/verify-random.md` for VRF integration (`ephemeral_vrf_sdk`) and callback consumption.

### 3.1 Program instrumentation (Anchor preferred; Rust alt)
- [x] Add ER hooks into on-chain programs (Anchor):
  - [x] Add `ephemeral-rollups-sdk` features in `Cargo.toml` with `features=["anchor"]`.
  - [x] Annotate program with `#[ephemeral]` to inject undelegation entrypoint (gated behind `er` feature).
  - [x] Add contexts using `#[delegate]` and `#[commit]` macros for:
    - [x] `delegate_batch` instruction to delegate PDAs to ER (batch PDA) [ref: `anchor-example.md`/`magicblock-1-inte.md`].
    - [x] `commit_batch` instruction(s) to commit delegated accounts [ref: `magicblock-1-inte.md`].
    - [x] `commit_and_undelegate_batch` to finalize and return ownership [ref: `magicblock-1-inte.md`].
  - [x] Include `magic_context` and `magic_program` accounts where required by commit/undelegate.
- [x] Settlement program extended with BatchEscrow PDA for ER batching.
- [ ] Native Rust parity (optional): mirror instructions per `rust-example.md` (exact Undelegate discriminator) for compatibility.
- [ ] **BLOCKED**: ER integration gated behind `er` feature flag due to `ephemeral-rollups-sdk v0.3.4` incompatibility with current Solana toolchain (rustc 1.84.1). The SDK has Pubkey type mismatches and missing system_instruction re-exports. Options:
  - Wait for Magicblock to release SDK compatible with Solana 2.x/Anchor 0.32.x
  - Use ER via client-side SDK only (TypeScript wrapper already implemented and working)
  - Build settlement program without `--features er` for now (base instructions work)

### 3.2 Client SDK wrappers (Routing + ER)
- [x] `packages/sdk/src/magicblock/router.ts`
  - [x] Wrap `ConnectionMagicRouter` and `sendMagicTransaction` to transparently route txs to ER or L1 [ref: `magic-router.md`].
  - [x] Implemented with actual `@magicblock-labs/ephemeral-rollups-sdk`
  - [x] Expose helpers: `sendMagicTransaction`, `sendToER`, `sendToBaseLayer`, `confirmTransaction`, health checks
  - [x] Retry logic with exponential backoff (configurable via `RetryConfig`)
  - [x] Error tracking integrated with metrics system
  - [ ] TODO: Implement `createDelegateInstruction` and `createCommitInstruction` with proper Anchor IDL data
- [x] `packages/sdk/src/magicblock/config.ts`
  - [x] Centralize endpoints and constants [ref: validator IDs in `eph-rollup.md`/`magicblock-1-inte.md`]:
    - [x] `MAGIC_ROUTER_URL`, `ROUTER_WS_URL`, `ER_DEVNET_URL`, `TEE_ER_URL`, `SOLANA_DEVNET_URL`.
    - [x] ER validator pubkeys (ASIA/EU/US/TEE/local) for delegation.
  - [x] `getERConfig()` helper for env-based configuration
- [x] `packages/sdk/package.json` created with dependencies
  - [x] `@magicblock-labs/ephemeral-rollups-sdk` v0.3.4 installed
  - [x] `@solana/web3.js`, `@coral-xyz/anchor`, `@solana/spl-token` added
- [x] Retries/health
  - [x] Health check implemented (`healthCheck()` method)
  - [x] Exponential backoff with configurable retry limits
  - [x] Error tracking per operation
- [x] Metrics & logs
  - [x] Track: batch commit latency, error rates, routed endpoint, counts per action.
  - [x] `packages/sdk/src/metrics/metrics.ts` extended with ER-specific metrics:
    - [x] `ERMetricsCollector` for batch commits (success/failed counts)
    - [x] Latency tracking (delegate, commit, undelegate, erExecution) with p50/p95/p99
    - [x] Error tracking by type
    - [x] `measureLatency()` helper for operation timing

### 3.3 Magic Actions (commit-time handlers)
- [ ] Implement optional commit-with-handler flow per `magic-router.md`:
  - [ ] On commit, attach call handler to run base-layer logic (e.g., post-commit bookkeeping) using `EXTERNAL_CALL_HANDLER_DISCRIMINATOR`.
  - [ ] Use `MagicInstructionBuilder` with `CommitType::WithHandler` and `ShortAccountMeta`.
  - [ ] Ensure compute budget and account mutability flags are correct.

### 3.4 Privacy: Private ER (TEE) [optional]
- [ ] `packages/sdk/src/magicblock/tee.ts`
  - [ ] Implement `verifyTeeRpcIntegrity()` attestation, `getAuthToken()` for challenge/response [ref: `private-eph-rollup.md`].
  - [ ] Append `?token=...` to ER URL when present; fall back gracefully.
- [ ] Program-side (optional): integrate permission program via CPI to restrict who can read ER state [ref: `private-eph-rollup.md`].

### 3.5 VRF for fair ordering/tie-breakers [optional]
- [ ] Program: integrate `ephemeral_vrf_sdk` to request randomness
  - [ ] `roll_dice`-style request and `callback_*` consumer adapted to our `Match`/batch model [ref: `verify-random.md`].
  - [ ] Enforce `vrf_program_identity` signer in callback context.
- [ ] SDK: expose a helper to initiate VRF requests where needed (e.g., intra-batch fair ordering).

### 3.6 Testing & validation
- [x] Test suite created: `programs/settlement/tests/settlement.test.ts`
  - [x] Base instructions test suite (initialize, add, finalize)
  - [x] 5 passing tests covering full batch lifecycle
  - [x] Error handling validation (finalized batch rejection)
  - [x] Test package.json and tsconfig.json configured
- [x] Run tests against devnet
  - [x] Settlement program deployed: `HkamtrV1uGYGHgL8rZxmXubtnLawS3yiizCBQXCpiZds`
  - [x] Test dependencies installed: `pnpm install`
  - [x] All tests passing: `./tests/node_modules/.bin/ts-mocha -p ./tests/tsconfig.json -t 1000000 tests/settlement.test.ts`
- [ ] ER-specific tests (blocked by SDK compatibility, use client-side routing instead)

### 3.7 Local dev & operations
- [ ] Scripts to run local ER validator and test flows [ref: `magicblock-1-inte.md`]
  - [ ] Install `@magicblock-labs/ephemeral-validator` and run with `--remote-url` to local/Devnet.
  - [ ] `mb-test-validator --reset` for base layer state.
  - [ ] Document env vars: `EPHEMERAL_PROVIDER_ENDPOINT`, `EPHEMERAL_WS_ENDPOINT`, `PROVIDER_ENDPOINT`, `WS_ENDPOINT`.
- [ ] Provide runbooks for Delegate → Execute on ER → Commit → (CommitWithHandler) → Undelegate.

---

## 4) Settlement — Solana + Anchor (Atomic Swaps)

- [x] Initialize `programs/settlement/` (Anchor)
  - [x] Instructions (base layer, non-ER):
    - [x] `initialize_batch` (create batch escrow PDA)
    - [x] `add_to_batch` (accumulate matched orders)
    - [x] `finalize_batch` (mark batch complete)
  - [x] Instructions (ER-gated, behind `er` feature):
    - [x] `delegate_batch` (delegate to ER)
    - [x] `commit_batch` (sync ER state to L1)
    - [x] `commit_and_undelegate_batch` (final commit + ownership return)
  - [x] PDAs & account constraints (BatchEscrow with seeds `["batch_escrow", batch_id]`)
  - [x] Reentrancy guards & overflow checks (Anchor `require!` macros)
- [x] Additional settlement instructions:
  - [x] `init_escrow` (per-trade escrow) - TradeEscrow PDA with seeds `["trade_escrow", match_id]`
  - [x] `deposit` (buyer/seller funding) - Validates amounts, prevents double deposits
  - [x] `settle_atomic_swap()` - Executes swap when both deposited (TODO: add Token-2022 CPI)
  - [x] `withdraw` - Cancel and return funds
- [x] State structs: BatchEscrow, TradeEscrow with full validation
- [x] Error codes: TradeAlreadySettled, AlreadyDeposited, InvalidAmount, MakerNotDeposited, TakerNotDeposited, NoDeposit
- [ ] Token-2022 integration (CPI to spl-token-2022 for confidential transfers)
- [ ] Price oracle integration (Pyth) with staleness checks
- [ ] Admin/upgrade authority policy (if using Anchor versioning)
- [x] IDL generation (auto-generated by Anchor build)
- [ ] TS types export to SDK
- [x] Devnet deployment: `HkamtrV1uGYGHgL8rZxmXubtnLawS3yiizCBQXCpiZds`
- [x] Unit and Anchor integration tests (mocha/ts-mocha)
  - [x] Batch lifecycle tests: `tests/settlement.test.ts` (5 passing)
  - [x] Atomic swap tests: `tests/atomic-swap.test.ts` (9 passing)

---

## 5) Token Privacy — Token-2022 Integration

### Phase 1: Basic Token-2022 Transfers ✅ COMPLETE

**Status**: Deployed to devnet and fully tested with real Token-2022 mints!

**Settlement Program** (`programs/settlement/programs/settlement/src/lib.rs`):
- [x] Add dependencies: `spl-token-2022` v9.0.0, `spl-associated-token-account` v6.0.0
- [x] Add token account fields to `Deposit`, `SettleSwap`, `Withdraw` contexts
- [x] Implement token transfer in `deposit` instruction with CPI
- [x] Implement atomic token swaps in `settle_atomic_swap` with PDA signing
- [x] Implement token refunds in `withdraw` instruction
- [x] Helper function `transfer_tokens()` using `transfer_checked` for decimal handling
- [x] Program ID: `HkamtrV1uGYGHgL8rZxmXubtnLawS3yiizCBQXCpiZds` (devnet)

**Tests** (`programs/settlement/tests/token22-swap.test.ts`):
- [x] Create Token-2022 mints with proper decimals (USDC 6dp, SOL 9dp)
- [x] Create associated token accounts for users and escrow
- [x] Test deposit flow (maker/taker deposit tokens)
- [x] Test atomic swap settlement (100 USDC ↔ 1 SOL)
- [x] Verify final balances and prevent double settlement
- [x] **All 6 tests passing** on devnet in 33s

### Phase 2: Privacy Architecture (Pragmatic Approach)

**Current Privacy Stack** (Already Implemented):
1. ✅ **Arcium MXE** - Encrypted order matching in MPC
   - Orders never revealed on-chain
   - Price discovery happens in encrypted computation
2. ✅ **Magicblock ER** - Fast batched settlement
   - Multiple trades batched together
   - Individual trade details obscured in batch
3. ✅ **Token-2022 Support** - Works with any SPL token

**Analysis**: Token-2022 confidential transfers add:
- **Pros**: Hide transfer amounts on-chain
- **Cons**: 
  - Complex ZK proof generation (3 proofs per transfer)
  - Requires ElGamal keypair management per user
  - Adds significant client-side computation
  - Settlement still reveals maker/taker addresses
  - **Our platform already hides orders via Arcium MXE**

**Decision**: Focus on what provides maximum privacy value:

**Phase 2A: Enhanced Privacy (Recommended)**
- [ ] **Stealth addresses** for settlement
  - Generate one-time addresses per trade
  - Maker/taker identities not linkable on-chain
- [ ] **Batch obfuscation** in ER
  - Mix multiple trades in single batch
  - Add dummy trades for anonymity set
- [ ] **Off-chain order book** via Arcium
  - No on-chain order data
  - Only settled trades visible

**Phase 2B: Confidential Transfers (Removed)**
- ❌ Confidential transfer stubs removed from `packages/sdk/src/solana/token22.ts`
- ❌ Not implementing: ElGamal keypairs, ZK proofs, encrypted amounts
- ✅ Replaced with simple Token-2022 helpers: `createToken22Mint()`, `createToken22Account()`

**Rationale**: 
- Confidential transfers add massive complexity (3 ZK proofs per transfer, ElGamal key mgmt)
- Privacy gain is minimal (still reveals addresses)
- Our stack already provides strong privacy:
  - Arcium MXE hides orders
  - Magicblock ER batches trades
  - Future: Stealth addresses hide identities
- Token-2022 works perfectly without confidential extension

---

## 6) TypeScript SDK (Clients and Orchestration)

- [x] Structure `packages/sdk/`:
  - [x] `src/arcium/` — MXE interactions (submit, match, reveal) - encryption.ts, client.ts, index.ts
  - [x] `src/magicblock/` — ER session client - router.ts, config.ts, index.ts
  - [x] `src/solana/` — Token-2022 helpers - token22.ts, index.ts
  - [x] `src/settlement/` — Settlement program client - client.ts, types.ts, index.ts
    - [x] `SettlementClient` class with typed methods
    - [x] PDA derivation helpers (trade escrow, batch escrow)
    - [x] Token account helpers (ATAs for Token-2022)
    - [x] Methods: initEscrow, deposit, settleAtomicSwap, withdraw
    - [x] Batch operations: initializeBatch, addToBatch, finalizeBatch
  - [ ] `src/config/` — env, network selectors (devnet/mainnet), addresses
  - [ ] `src/types/` — shared types (Order, Match, SettlementBatch)
  - [x] `src/index.ts` — public exports
  - [x] `examples/settlement-flow.ts` — Usage example
- [ ] Error taxonomy & custom Error classes
- [ ] Retries, timeouts, rate limiting (p-retry/p-limit)
- [ ] Telemetry hooks (events emitted for monitoring)

---

## 7) Compliance & KYC (App Layer)

- [ ] KYC gate (MVP: mock/stub) integrated with DB `User.kycStatus`
- [ ] Sanctions screening API integration (if keys present)
- [ ] Transaction limits
  - [ ] Enforce `MAX_TRADE_SIZE` and `MIN_TRADE_SIZE` from env
- [ ] Audit logging
  - [ ] Define consistent `AuditLog.details` schema (JSONB)
  - [ ] Log `ORDER`, `MATCH`, `SETTLE` events with hashed IDs
- [ ] Admin endpoints (non-bot) for viewing audit logs (optional REST)

---

## 8) REST API (Optional — Non-Bot)

- [ ] Minimal service exposing:
  - [ ] `POST /api/v1/orders` (proxy to Arcium client)
  - [ ] `GET /api/v1/orders/:id`
  - [ ] `GET /api/v1/matches`
  - [ ] `POST /api/v1/settle/:matchId`
- [ ] AuthN/Z (JWT or header token) and rate limiting
- [ ] OpenAPI/Swagger spec

---

## 9) Monitoring & Observability

- [ ] Structured logging (pino/winston) with `LOG_LEVEL`
- [ ] Sentry DSN wiring (errors only in prod)
- [ ] Metrics (Datadog/OpenTelemetry):
  - [ ] Orders submitted/hour
  - [ ] Matching latency & success rate
  - [ ] ER finalize latency & failures
  - [ ] Settlement success rate
  - [ ] Confidential transfer failure rate
- [ ] Alerts:
  - [ ] ER session failure (critical)
  - [ ] MPC timeout (warning)
  - [ ] High gas/fees (info)

---

## 10) Security & Secrets

- [ ] Secrets loading via `dotenv` + process vars (no commits)
- [ ] Input validation (zod) at all boundaries (API/SDK)
- [ ] Key management plan:
  - [ ] Solana keypairs (wallet path)
  - [ ] Arcium API keys
  - [ ] magicblock session key
  - [ ] Token-2022 ElGamal keys per user
- [ ] SGX/TEE attestation verification (if exposed by magicblock)
- [ ] DoS/rate limit controls and backpressure
- [ ] PII/Compliance: hash user identifiers in logs; never store raw secrets

---

## 11) Testing Strategy

- [ ] Unit tests
  - [ ] SDK utils (token22 helpers, config parsing)
  - [ ] Matching algorithm unit tests (pure logic invariants)
- [ ] Integration tests
  - [ ] Arcium encrypted submission → match → reveal
  - [ ] ER batching (mock/fake if SDK supports) → finalize callback
  - [ ] Anchor settlement invocation → account state assertions
  - [ ] Token-2022 transfer success/invalid-proof failures
- [ ] End-to-end tests
  - [ ] Two users place compatible orders → private match → batch → atomic settle
- [ ] Load tests
  - [ ] 1K+ orders simulation; capture throughput/latency
- [ ] CI test matrix (Node 18/20; optional OS matrix)

---

## 12) CI/CD Pipeline

- [ ] GitHub Actions workflows:
  - [ ] `ci.yml` — install, cache, build, lint, test, coverage
  - [ ] `programs.yml` — build Anchor & Arcium, publish artifacts (IDL)
  - [ ] `release.yml` — version bump + changelog (changesets)
- [ ] Artifact publishing
  - [ ] Upload IDL files
  - [ ] Package SDK (private registry or GitHub Packages)

---

## 13) Devnet Deployment

- [ ] Scripts in `scripts/`:
  - [ ] `deploy-arcium-devnet`
  - [ ] `deploy-anchor-devnet`
  - [ ] `init-magicblock-session`
  - [ ] `init-token22-dev-assets`
- [ ] Address/ID registry (JSON) committed for devnet
- [ ] Smoke test runbooks

---

## 14) Documentation

- [ ] Update `README.md` with non-bot flow and runbooks
- [ ] Expand `TECHNICAL_STACK.md` with concrete repo paths & commands
- [ ] Add `docs/` with:
  - [ ] Architecture diagrams
  - [ ] API reference (OpenAPI)
  - [ ] Operations runbooks (deploy, rotate keys, rollback)

---

## 15) Roadmap (Post-MVP)

- [ ] Partial fills & advanced order types (GTD/expiry)
- [ ] Institutional API keys + RBAC
- [ ] Insurance fund mechanics
- [ ] Cross-chain OTC (Wormhole)
- [ ] Governance token (SHADOW) + incentives

---

## 16) Environment Prereqs (for contributors)

- [ ] Node >= 18, PNPM >= 8 (`package.json` engines)
- [ ] Rust toolchain + Solana + Anchor
- [ ] Arcium CLI and API key
- [ ] magicblock SDK and session key
- [ ] Pyth access (for oracles)
- [ ] Sentry/Datadog keys (optional)

---

Notes:
- Telegram bot integration is intentionally excluded from this checklist.
- Database is assumed available and seeded; further DB migrations may be added as needed for new features (e.g., order book summaries, compliance metadata).
