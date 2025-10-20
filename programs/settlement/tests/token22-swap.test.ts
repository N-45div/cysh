import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Settlement } from "../target/types/settlement";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  createInitializeMint2Instruction,
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  getAccount,
} from "@solana/spl-token";
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";

describe("Token-2022 Atomic Swaps", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Load program manually from IDL
  const programId = new PublicKey("HkamtrV1uGYGHgL8rZxmXubtnLawS3yiizCBQXCpiZds");
  const idlPath = path.join(__dirname, "../target/idl/settlement.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
  const program = new Program(idl, provider) as Program<Settlement>;
  const connection = provider.connection;
  const payer = provider.wallet as anchor.Wallet;

  // Test accounts
  let makerKeypair: Keypair;
  let takerKeypair: Keypair;
  let usdcMint: Keypair;
  let solMint: Keypair;
  let matchId: anchor.BN;
  let tradeEscrowPda: PublicKey;

  // Token accounts
  let makerUsdcAccount: PublicKey;
  let makerSolAccount: PublicKey;
  let takerUsdcAccount: PublicKey;
  let takerSolAccount: PublicKey;
  let escrowUsdcAccount: PublicKey;
  let escrowSolAccount: PublicKey;

  /**
   * Helper: Create a Token-2022 mint
   */
  async function createToken22Mint(
    decimals: number = 6
  ): Promise<Keypair> {
    const mintKeypair = Keypair.generate();
    const lamports = await connection.getMinimumBalanceForRentExemption(82);

    const transaction = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: mintKeypair.publicKey,
        space: 82,
        lamports,
        programId: TOKEN_2022_PROGRAM_ID,
      }),
      createInitializeMint2Instruction(
        mintKeypair.publicKey,
        decimals,
        payer.publicKey,
        null,
        TOKEN_2022_PROGRAM_ID
      )
    );

    await sendAndConfirmTransaction(connection, transaction, [
      payer.payer,
      mintKeypair,
    ]);

    console.log(`Created Token-2022 mint: ${mintKeypair.publicKey.toBase58()}`);
    return mintKeypair;
  }

  /**
   * Helper: Create associated token account
   */
  async function createATA(
    mint: PublicKey,
    owner: PublicKey
  ): Promise<PublicKey> {
    const ata = getAssociatedTokenAddressSync(
      mint,
      owner,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    const transaction = new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(
        payer.publicKey,
        ata,
        owner,
        mint,
        TOKEN_2022_PROGRAM_ID
      )
    );

    await sendAndConfirmTransaction(connection, transaction, [payer.payer]);
    return ata;
  }

  /**
   * Helper: Mint tokens to an account
   */
  async function mintTokens(
    mint: PublicKey,
    destination: PublicKey,
    amount: number
  ): Promise<void> {
    const transaction = new Transaction().add(
      createMintToInstruction(
        mint,
        destination,
        payer.publicKey,
        amount,
        [],
        TOKEN_2022_PROGRAM_ID
      )
    );

    await sendAndConfirmTransaction(connection, transaction, [payer.payer]);
  }

  before(async () => {
    // Create test users
    makerKeypair = Keypair.generate();
    takerKeypair = Keypair.generate();

    // Fund test users from payer (more reliable than airdrop)
    const fundTx = new Transaction()
      .add(
        SystemProgram.transfer({
          fromPubkey: payer.publicKey,
          toPubkey: makerKeypair.publicKey,
          lamports: 2 * anchor.web3.LAMPORTS_PER_SOL,
        })
      )
      .add(
        SystemProgram.transfer({
          fromPubkey: payer.publicKey,
          toPubkey: takerKeypair.publicKey,
          lamports: 2 * anchor.web3.LAMPORTS_PER_SOL,
        })
      );
    
    await sendAndConfirmTransaction(connection, fundTx, [payer.payer]);

    console.log("Maker:", makerKeypair.publicKey.toBase58());
    console.log("Taker:", takerKeypair.publicKey.toBase58());

    // Create Token-2022 mints
    usdcMint = await createToken22Mint(6); // 6 decimals for USDC
    solMint = await createToken22Mint(9);  // 9 decimals for SOL

    // Create token accounts for maker
    makerUsdcAccount = await createATA(usdcMint.publicKey, makerKeypair.publicKey);
    makerSolAccount = await createATA(solMint.publicKey, makerKeypair.publicKey);

    // Create token accounts for taker
    takerUsdcAccount = await createATA(usdcMint.publicKey, takerKeypair.publicKey);
    takerSolAccount = await createATA(solMint.publicKey, takerKeypair.publicKey);

    // Mint initial tokens
    await mintTokens(usdcMint.publicKey, makerUsdcAccount, 1000_000000); // 1000 USDC to maker
    await mintTokens(solMint.publicKey, takerSolAccount, 10_000000000); // 10 SOL to taker

    console.log("Initial balances:");
    console.log("  Maker USDC: 1000");
    console.log("  Taker SOL: 10");

    // Generate match ID and derive escrow PDA
    matchId = new anchor.BN(Date.now());
    [tradeEscrowPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("trade_escrow"), matchId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    // Derive escrow token accounts
    escrowUsdcAccount = getAssociatedTokenAddressSync(
      usdcMint.publicKey,
      tradeEscrowPda,
      true,
      TOKEN_2022_PROGRAM_ID
    );
    escrowSolAccount = getAssociatedTokenAddressSync(
      solMint.publicKey,
      tradeEscrowPda,
      true,
      TOKEN_2022_PROGRAM_ID
    );
  });

  it("Initializes trade escrow", async () => {
    const makerAmount = new anchor.BN(100_000000); // 100 USDC
    const takerAmount = new anchor.BN(1_000000000); // 1 SOL

    await program.methods
      .initEscrow(
        matchId,
        makerKeypair.publicKey,
        takerKeypair.publicKey,
        usdcMint.publicKey,
        solMint.publicKey,
        makerAmount,
        takerAmount
      )
      .accounts({
        authority: payer.publicKey,
      })
      .rpc();

    const escrow = await program.account.tradeEscrow.fetch(tradeEscrowPda);
    assert.equal(escrow.matchId.toString(), matchId.toString());
    assert.equal(escrow.maker.toBase58(), makerKeypair.publicKey.toBase58());
    assert.equal(escrow.taker.toBase58(), takerKeypair.publicKey.toBase58());
    assert.equal(escrow.makerToken.toBase58(), usdcMint.publicKey.toBase58());
    assert.equal(escrow.takerToken.toBase58(), solMint.publicKey.toBase58());
    assert.equal(escrow.makerAmount.toString(), makerAmount.toString());
    assert.equal(escrow.takerAmount.toString(), takerAmount.toString());
    assert.isFalse(escrow.makerDeposited);
    assert.isFalse(escrow.takerDeposited);
    assert.isFalse(escrow.isSettled);

    console.log("✓ Trade escrow initialized");
  });

  it("Creates escrow token accounts", async () => {
    // Create escrow's USDC account
    const createUsdcTx = new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(
        payer.publicKey,
        escrowUsdcAccount,
        tradeEscrowPda,
        usdcMint.publicKey,
        TOKEN_2022_PROGRAM_ID
      )
    );
    await sendAndConfirmTransaction(connection, createUsdcTx, [payer.payer]);

    // Create escrow's SOL account
    const createSolTx = new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(
        payer.publicKey,
        escrowSolAccount,
        tradeEscrowPda,
        solMint.publicKey,
        TOKEN_2022_PROGRAM_ID
      )
    );
    await sendAndConfirmTransaction(connection, createSolTx, [payer.payer]);

    console.log("✓ Escrow token accounts created");
  });

  it("Maker deposits USDC", async () => {
    const makerAmount = new anchor.BN(100_000000); // 100 USDC

    await program.methods
      .deposit(makerAmount)
      .accounts({
        depositor: makerKeypair.publicKey,
        tradeEscrow: tradeEscrowPda,
        mint: usdcMint.publicKey,
        depositorTokenAccount: makerUsdcAccount,
        escrowTokenAccount: escrowUsdcAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([makerKeypair])
      .rpc();

    const escrow = await program.account.tradeEscrow.fetch(tradeEscrowPda);
    assert.isTrue(escrow.makerDeposited);

    const escrowAccount = await getAccount(
      connection,
      escrowUsdcAccount,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
    assert.equal(escrowAccount.amount.toString(), makerAmount.toString());

    console.log("✓ Maker deposited 100 USDC");
  });

  it("Taker deposits SOL", async () => {
    const takerAmount = new anchor.BN(1_000000000); // 1 SOL

    await program.methods
      .deposit(takerAmount)
      .accounts({
        depositor: takerKeypair.publicKey,
        tradeEscrow: tradeEscrowPda,
        mint: solMint.publicKey,
        depositorTokenAccount: takerSolAccount,
        escrowTokenAccount: escrowSolAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([takerKeypair])
      .rpc();

    const escrow = await program.account.tradeEscrow.fetch(tradeEscrowPda);
    assert.isTrue(escrow.takerDeposited);

    const escrowAccount = await getAccount(
      connection,
      escrowSolAccount,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
    assert.equal(escrowAccount.amount.toString(), takerAmount.toString());

    console.log("✓ Taker deposited 1 SOL");
  });

  it("Settles atomic swap", async () => {
    await program.methods
      .settleAtomicSwap()
      .accounts({
        authority: payer.publicKey,
        tradeEscrow: tradeEscrowPda,
        makerMint: usdcMint.publicKey,
        takerMint: solMint.publicKey,
        escrowMakerTokenAccount: escrowUsdcAccount,
        escrowTakerTokenAccount: escrowSolAccount,
        makerReceiveAccount: makerSolAccount,
        takerReceiveAccount: takerUsdcAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    const escrow = await program.account.tradeEscrow.fetch(tradeEscrowPda);
    assert.isTrue(escrow.isSettled);

    // Check final balances
    const makerSol = await getAccount(
      connection,
      makerSolAccount,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
    const takerUsdc = await getAccount(
      connection,
      takerUsdcAccount,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    assert.equal(makerSol.amount.toString(), "1000000000"); // Maker received 1 SOL
    assert.equal(takerUsdc.amount.toString(), "100000000"); // Taker received 100 USDC

    console.log("✓ Atomic swap completed successfully");
    console.log("  Maker received: 1 SOL");
    console.log("  Taker received: 100 USDC");
  });

  it("Prevents double settlement", async () => {
    try {
      await program.methods
        .settleAtomicSwap()
        .accounts({
          authority: payer.publicKey,
          tradeEscrow: tradeEscrowPda,
          makerMint: usdcMint.publicKey,
          takerMint: solMint.publicKey,
          escrowMakerTokenAccount: escrowUsdcAccount,
          escrowTakerTokenAccount: escrowSolAccount,
          makerReceiveAccount: makerSolAccount,
          takerReceiveAccount: takerUsdcAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
      assert.fail("Should have thrown error");
    } catch (err: any) {
      assert.include(err.toString(), "TradeAlreadySettled");
      console.log("✓ Double settlement prevented");
    }
  });
});
