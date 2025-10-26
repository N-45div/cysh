/**
 * Integration test for Arcium MXE encrypted order matching
 *
 * Flow:
 * 1. Initialize match_orders computation definition
 * 2. Encrypt two orders (bid and ask)
 * 3. Submit to match_orders instruction
 * 4. Await finalization and callback
 * 5. Listen for MatchResultEvent and decrypt result
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair } from "@solana/web3.js";
import { randomBytes } from "crypto";
import { ArciumMatching } from "../target/types/arcium_matching";
import { expect } from "chai";

// Arcium client helpers (documented in arcium-integ.md)
import {
  x25519,
  RescueCipher,
  awaitComputationFinalization,
  getClusterAccAddress,
  getMXEPublicKey,
  getComputationAccAddress,
  getMXEAccAddress,
  getMempoolAccAddress,
  getExecutingPoolAccAddress,
  getCompDefAccAddress,
  getCompDefAccOffset,
  deserializeLE,
} from "@arcium-hq/client";

describe("arcium-matching: encrypted order matching", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.ArciumMatching as Program<ArciumMatching>;
  const payer = provider.wallet as anchor.Wallet;

  // Devnet cluster offset from Arcium.toml - Official Arcium public cluster
  const CLUSTER_OFFSET = 1078779259;
  const arciumClusterPubkey = getClusterAccAddress(CLUSTER_OFFSET);

  // Store the initialized comp def address
  let initializedCompDefAddress: PublicKey;

  // Skip tests if Arcium DKG is not ready
  before(function() {
    if (process.env.ARCIUM_ENABLED !== 'true') {
      console.log('⚠️  Skipping Arcium tests: Set ARCIUM_ENABLED=true to run');
      console.log('   Using official Arcium public cluster: 1078779259');
      this.skip();
    }
  });

  // Local helpers (pattern consistent with tests/arcium_matching.ts)
  type Event = anchor.IdlEvents<(typeof program)["idl"]>;
  const awaitEvent = async <E extends keyof Event>(
    eventName: E
  ): Promise<Event[E]> => {
    let listenerId: number;
    const event = await new Promise<Event[E]>((res) => {
      listenerId = program.addEventListener(eventName, (event) => {
        res(event);
      });
    });
    await program.removeEventListener(listenerId);
    return event;
  };

  async function getMXEPublicKeyWithRetry(
    provider: anchor.AnchorProvider,
    programId: PublicKey,
    maxRetries: number = 10,
    retryDelayMs: number = 500
  ): Promise<Uint8Array> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const mxePublicKey = await getMXEPublicKey(provider, programId);
        if (mxePublicKey) return mxePublicKey;
      } catch (error) {
        console.log(`Attempt ${attempt} failed to fetch MXE public key via SDK`);
      }
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }
    
    // Fallback: Try to extract public key directly from MXE account data
    console.log("SDK method failed, attempting manual extraction from MXE account...");
    try {
      const mxeAccountAddress = getMXEAccAddress(programId);
      const mxeAccount = await provider.connection.getAccountInfo(mxeAccountAddress);
      
      if (mxeAccount && mxeAccount.data.length >= 32) {
        // MXE account structure: the x25519 public key is at offset 0-31
        const publicKey = mxeAccount.data.slice(0, 32);
        console.log("✓ Extracted public key from MXE account data (32 bytes)");
        console.log("  First 8 bytes:", Buffer.from(publicKey.slice(0, 8)).toString('hex'));
        return publicKey;
      }
    } catch (fallbackError) {
      console.error("Fallback extraction also failed:", fallbackError);
    }
    
    throw new Error(`Failed to fetch MXE public key after ${maxRetries} attempts and fallback`);
  }

  const toU64FromPubkey = (pk: PublicKey): bigint => {
    const b = pk.toBytes().slice(0, 8);
    return b.reduce((acc, v, i) => acc | (BigInt(v) << BigInt(8 * i)), 0n);
  };

  it("initializes computation definition (if needed)", async () => {
    const compDefOffset = Buffer.from(getCompDefAccOffset("match_orders")).readUInt32LE();
    const compDefAddress = getCompDefAccAddress(program.programId, compDefOffset);
    
    console.log("Computation definition offset:", compDefOffset);
    console.log("Computation definition address:", compDefAddress.toBase58());
    console.log("Check status with: solana account", compDefAddress.toBase58(), "-u devnet");

    // Store for use in other tests
    initializedCompDefAddress = compDefAddress;

    // Check if comp def already exists
    try {
      const compDefAccount = await provider.connection.getAccountInfo(compDefAddress);
      if (compDefAccount !== null) {
        console.log("✓ Computation definition already initialized, skipping");
        console.log("  Account size:", compDefAccount.data.length, "bytes");
        return;
      }
    } catch (error) {
      console.log("Comp def not found, initializing...");
    }

    // Initialize if not exists
    const sig = await program.methods
      .initMatchOrdersCompDef()
      .accountsPartial({
        payer: payer.publicKey,
        mxeAccount: getMXEAccAddress(program.programId),
        compDefAccount: compDefAddress,
      })
      .rpc({ commitment: "confirmed" });

    console.log("init_match_orders_comp_def:", sig);
    
    // Wait for computation definition to be fully initialized
    console.log("⏳ Waiting for computation definition to complete (60s)...");
    console.log("   The circuit bytecode is being uploaded to the cluster");
    await new Promise(resolve => setTimeout(resolve, 60000));
    
    // Verify it's ready
    const finalCompDefAccount = await provider.connection.getAccountInfo(compDefAddress);
    if (finalCompDefAccount && finalCompDefAccount.data.length > 200) {
      console.log("✓ Computation definition ready! Account size:", finalCompDefAccount.data.length, "bytes");
    } else {
      console.log("⚠️  Computation definition may still be processing. Account size:", finalCompDefAccount?.data.length || 0, "bytes");
      console.log("   Expected: ~228 bytes. You may need to wait longer or re-run the test.");
    }
  });

  it("encrypts, queues, finalizes, and decrypts match result", async () => {
    // Verify comp def is ready before proceeding
    const compDefAccount = await provider.connection.getAccountInfo(initializedCompDefAddress);
    if (!compDefAccount || compDefAccount.data.length < 200) {
      throw new Error(
        `Computation definition not ready. Account size: ${compDefAccount?.data.length || 0} bytes. ` +
        `Expected: ~228 bytes. Please wait and re-run the test.`
      );
    }
    console.log("✓ Computation definition verified ready:", compDefAccount.data.length, "bytes");
    
    // 1) Prepare orders (compatible)
    const tokenMint = new PublicKey("So11111111111111111111111111111111111111112");
    const bidAmount = 1000n;
    const bidPrice = 100n;
    const askAmount = 1000n;
    const askPrice = 95n; // <= bidPrice → match
    const expiry = BigInt(Math.floor(Date.now() / 1000) + 3600);

    const traderA = payer.publicKey;
    const traderB = Keypair.generate().publicKey;

    // Map to plaintexts (12 fields)
    const bidTokenMint = toU64FromPubkey(tokenMint);
    const askTokenMint = toU64FromPubkey(tokenMint);
    const bidSide = 0n; // buy
    const askSide = 1n; // sell
    const bidTraderId = toU64FromPubkey(traderA);
    const askTraderId = toU64FromPubkey(traderB);

    // 2) x25519 + RescueCipher setup
    const privateKey = x25519.utils.randomSecretKey();
    const publicKey = x25519.getPublicKey(privateKey);
    
    // Debug: Print expected MXE account address
    const mxeAccountAddress = getMXEAccAddress(program.programId);
    console.log("Expected MXE account:", mxeAccountAddress.toBase58());
    console.log("Verify with: solana account", mxeAccountAddress.toBase58(), "-u devnet");
    
    const mxePublicKey = await getMXEPublicKeyWithRetry(
      provider as anchor.AnchorProvider,
      program.programId
    );
    const sharedSecret = x25519.getSharedSecret(privateKey, mxePublicKey);
    const cipher = new RescueCipher(sharedSecret);

    // 3) Encrypt 12-field plaintext vector
    const nonceBytes = randomBytes(16);
    const plaintext: bigint[] = [
      bidTokenMint,
      bidSide,
      bidAmount,
      bidPrice,
      expiry,
      bidTraderId,
      askTokenMint,
      askSide,
      askAmount,
      askPrice,
      expiry,
      askTraderId,
    ];
    const ciphertexts = cipher.encrypt(plaintext, nonceBytes);

    // 4) Queue computation
    const computationOffset = new anchor.BN(Buffer.from(randomBytes(8)).toString("hex"), 16);

    const matchEventPromise = awaitEvent("matchResultEvent");

    const queueSig = await program.methods
      .matchOrders(
        computationOffset,
        // Bid ciphertexts (6)
        Array.from(ciphertexts[0]), // token_mint (u64)
        Array.from(ciphertexts[1]), // side (u8)
        Array.from(ciphertexts[2]), // amount (u64)
        Array.from(ciphertexts[3]), // price (u64)
        Array.from(ciphertexts[4]), // expiry (u64)
        Array.from(ciphertexts[5]), // trader_id (u64)
        // Ask ciphertexts (6)
        Array.from(ciphertexts[6]),
        Array.from(ciphertexts[7]),
        Array.from(ciphertexts[8]),
        Array.from(ciphertexts[9]),
        Array.from(ciphertexts[10]),
        Array.from(ciphertexts[11]),
        // Encryption metadata
        Array.from(publicKey),
        new anchor.BN(deserializeLE(nonceBytes).toString()),
      )
      .accountsPartial({
        computationAccount: getComputationAccAddress(program.programId, computationOffset),
        mxeAccount: getMXEAccAddress(program.programId),
        mempoolAccount: getMempoolAccAddress(program.programId),
        executingPool: getExecutingPoolAccAddress(program.programId),
        compDefAccount: initializedCompDefAddress,
        clusterAccount: arciumClusterPubkey,
      })
      .rpc({ commitment: "confirmed" });

    console.log("queue match_orders:", queueSig);

    // 5) Await finalization (MPC compute + callback)
    const finalizeSig = await awaitComputationFinalization(
      provider as anchor.AnchorProvider,
      computationOffset,
      program.programId,
      "confirmed",
    );
    console.log("finalized:", finalizeSig);

    // 6) Receive event and decrypt
    const evt = await matchEventPromise;
    const [isMatch, matchedAmount, agreedPrice] = cipher.decrypt(
      [evt.isMatch, evt.matchedAmount, evt.agreedPrice],
      new Uint8Array(evt.nonce)
    );

    expect(isMatch).to.equal(1n);
    expect(matchedAmount).to.equal(askAmount < bidAmount ? askAmount : bidAmount);
    expect(agreedPrice).to.equal(askPrice);

    console.log("✓ match result:", {
      isMatch: isMatch.toString(),
      matchedAmount: matchedAmount.toString(),
      agreedPrice: agreedPrice.toString(),
    });
  });
});
