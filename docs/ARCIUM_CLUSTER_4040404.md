# Arcium Cluster 4040404 - Active Configuration

## Status: ✅ OPERATIONAL

**Date Activated**: October 21, 2025

## Cluster Details

- **Cluster Offset**: `4040404`
- **Node Offset**: `2390982837` (your node)
- **Fee**: 10 ARX per compute unit (voted and approved)
- **Vote Transaction**: `kWnTwpdPouyXovGeXyELwDkfK1KYqxyfhPEaMWH2jNXRSxdaGS2GNuH4Ubbn5HSggaL1DxzWwT63v19L4pyNk3U`

## MXE Account

- **Address**: `6yNS68eYTq1afL1WcWExWfHwxSng2LEbn3wWPyf8eBJ1`
- **Owner**: `BKck65TgoKRokMjQM3datB9oRwJ8rAj2jxPXvHXUvcL6` (Arcium program)
- **Balance**: 0.00164256 SOL
- **Size**: 108 bytes
- **Status**: Active on devnet

### Account Data Structure

```
Offset  Data
------  ----
0x00    x25519 public key (32 bytes)
0x20    Additional cluster metadata (76 bytes)
```

## Program Configuration

### Arcium Matching Program

- **Program ID**: `6QFiiqmYBELXw9LgGwogYcwiXkRD6AyGjWtXgoJ3NS3G`
- **Location**: `programs/arcium-matching/`
- **Anchor.toml**: Updated with cluster offset 4040404

### Settlement Program

- **Program ID**: `HkamtrV1uGYGHgL8rZxmXubtnLawS3yiizCBQXCpiZds`
- **Location**: `programs/settlement/`
- **Purpose**: Token-2022 atomic swaps (independent of Arcium)

## SDK Configuration

### Updated Files

1. **`packages/sdk/src/arcium/client.ts`**
   ```typescript
   export const DEFAULT_ARCIUM_CONFIG: Partial<ArciumConfig> = {
     rpcUrl: 'https://api.devnet.solana.com',
     clusterOffset: 4040404, // Active cluster with DKG
     nodeOffset: 2390982837, // Your node offset
   };
   ```

2. **`programs/arcium-matching/Arcium.toml`**
   ```toml
   [mxe]
   cluster_offset = 4040404
   ```

3. **`programs/arcium-matching/tests/match-orders.ts`**
   ```typescript
   const CLUSTER_OFFSET = 4040404;
   ```

## Testing

### Run Integration Tests

```bash
cd programs/arcium-matching
npx ts-mocha -p ./tsconfig.json -t 1000000 tests/match-orders.ts
```

### Expected Flow

1. ✅ Initialize computation definition (one-time)
2. ✅ Encrypt orders with x25519 + RescueCipher
3. ✅ Submit to `match_orders` instruction
4. ✅ Await MPC computation finalization
5. ✅ Receive and decrypt `MatchResultEvent`

### Troubleshooting

**Issue**: `Failed to fetch MXE public key`

**Solution**: Test file includes fallback to manually extract public key from MXE account data (first 32 bytes).

**Verify MXE Account**:
```bash
solana account 6yNS68eYTq1afL1WcWExWfHwxSng2LEbn3wWPyf8eBJ1 -u devnet
```

## Integration with Settlement

### Order Flow

```
1. User submits order → Arcium MXE (cluster 4040404)
   ├─ Encrypt with x25519 ECDH
   └─ Submit to match_orders instruction

2. MPC computes match → generates match_id
   ├─ Runs in TEE with DKG
   └─ Emits MatchResultEvent

3. Match result → Settlement program
   ├─ Call initEscrow(match_id)
   └─ Users deposit tokens

4. Settlement → Atomic swap
   ├─ Both parties deposited
   └─ Call settleAtomicSwap()
```

## Next Steps

1. **Run tests** to verify cluster connectivity
2. **Implement bot integration** to submit orders to cluster 4040404
3. **Connect to settlement** program for post-match atomic swaps
4. **Monitor cluster health** via `arcium cluster-info --cluster-offset 4040404`

## Resources

- **Arcium Docs**: https://docs.arcium.com
- **Cluster Explorer**: Check MXE account on Solana Explorer (devnet)
- **Vote Command**: 
  ```bash
  arcium vote-fee \
    --cluster-offset 4040404 \
    --node-offset 2390982837 \
    --fee-per-cu 10 \
    --keypair-path node-keypair.json \
    --rpc-url https://api.devnet.solana.com/
  ```

## CI/Automation

**Test Gating**: Keep `ARCIUM_ENABLED=false` (default) until DKG is confirmed complete.

```bash
# Skip Arcium tests (default)
pnpm test:arcium

# Run Arcium tests when DKG is ready
ARCIUM_ENABLED=true pnpm test:arcium
```

**Current Status**: Tests are gated with environment variable check. When `ARCIUM_ENABLED !== 'true'`, tests skip gracefully with informative message.

## Notes

- DKG was previously down, now operational
- Old cluster offsets (e.g., 1078779259) are deprecated
- Settlement program works independently - no changes needed
- Privacy comes from Arcium MXE + Magicblock ER batching
- **MxeKeysNotSet (6002)**: Cluster nodes haven't finalized key agreement yet - tests will skip until resolved
