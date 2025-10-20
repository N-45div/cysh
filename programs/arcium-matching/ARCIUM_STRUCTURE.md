# Arcium MXE Structure - Shadow OTC Nexus

## Overview

This directory contains the Arcium MPC eXecution Environment (MXE) for encrypted OTC order matching.

## Directory Structure

```
programs/arcium-matching/
├── Arcium.toml              # Arcium configuration (localnet, backends)
├── Anchor.toml              # Anchor configuration
├── Cargo.toml               # Rust workspace
├── encrypted-ixs/           # Confidential instructions (Arcis framework)
│   └── src/
│       └── lib.rs           # Order matching logic in MPC
├── programs/
│   └── arcium_matching/     # Solana program
│       └── src/
│           └── lib.rs       # On-chain instructions
└── tests/                   # TypeScript integration tests
```

## Build Commands

**Important**: Must be run from within `programs/arcium-matching/` directory.

```bash
cd programs/arcium-matching

# Build encrypted instructions + Solana program
arcium build

# Run tests (requires local Arcium cluster)
arcium test

# Deploy to devnet
arcium deploy --cluster-offset <CLUSTER_ID> --keypair-path ~/.config/solana/id.json -u d
```

## Encrypted Instructions (Arcis)

Located in `encrypted-ixs/src/lib.rs`:

### `match_orders`
- **Input**: Two encrypted `Order` structs (bid and ask)
- **Output**: Encrypted `MatchResult`
- **Logic**: 
  - Checks same token, opposite sides, price compatibility
  - Computes matched amount (min of both)
  - Returns encrypted result

### Order Schema
```rust
pub struct Order {
    token_mint: u64,    // Token identifier
    side: u8,           // 0 = Buy, 1 = Sell
    amount: u64,        // Token amount
    price: u64,         // Price in quote token
    expiry: u64,        // Unix timestamp
    trader_id: u64,     // Trader identifier
}
```

### MatchResult Schema
```rust
pub struct MatchResult {
    is_match: u8,           // 1 = match, 0 = no match
    matched_amount: u64,    // Agreed amount
    agreed_price: u64,      // Agreed price
}
```

## Solana Program

Located in `programs/arcium_matching/src/lib.rs`:

### Instructions (3-step pattern per confidential function)

1. **`init_match_orders_comp_def`**: Initialize computation definition (one-time)
2. **`match_orders`**: Queue encrypted matching computation
3. **`match_orders_callback`**: Receive MPC result

## Integration with Monorepo

- Arcium workspace is self-contained
- Use `arcium` CLI for all build/test operations
- Root `Cargo.toml` references other Anchor programs (settlement, compliance)
- TypeScript SDK in `packages/sdk/src/arcium/` will wrap client interactions

## Client-Side Encryption

Uses `@arcium-hq/client` library:
1. Generate x25519 keypair
2. Fetch MXE cluster public key
3. Derive shared secret via ECDH
4. Encrypt order data with RescueCipher (CTR mode)
5. Submit encrypted ciphertext to Solana program
6. Decrypt result using same shared secret

## Next Steps

- [ ] Add Solana program instructions for `match_orders`
- [ ] Implement callback handler for match results
- [ ] Create TypeScript client wrapper in `packages/sdk/`
- [ ] Add integration tests
- [ ] Deploy computation definition to devnet
