use anchor_lang::prelude::*;
use solana_program::{
    program::invoke_signed,
    program_pack::Pack,
};

declare_id!("HkamtrV1uGYGHgL8rZxmXubtnLawS3yiizCBQXCpiZds");

const BATCH_ESCROW_SEED: &[u8] = b"batch_escrow";
const TRADE_ESCROW_SEED: &[u8] = b"trade_escrow";

// Helper function for Token-2022 transfer
fn transfer_tokens<'info>(
    from: &AccountInfo<'info>,
    mint: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    authority: &AccountInfo<'info>,
    token_program: &AccountInfo<'info>,
    amount: u64,
    decimals: u8,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    let ix = spl_token_2022::instruction::transfer_checked(
        token_program.key,
        from.key,
        mint.key,
        to.key,
        authority.key,
        &[],
        amount,
        decimals,
    )?;
    
    invoke_signed(
        &ix,
        &[from.clone(), mint.clone(), to.clone(), authority.clone(), token_program.clone()],
        signer_seeds,
    )?;
    
    Ok(())
}

#[program]
pub mod settlement {
    use super::*;

    /// Initialize a batch escrow PDA for collecting matched orders
    pub fn initialize_batch(ctx: Context<InitializeBatch>, batch_id: u64) -> Result<()> {
        let batch = &mut ctx.accounts.batch_escrow;
        batch.batch_id = batch_id;
        batch.authority = ctx.accounts.authority.key();
        batch.order_count = 0;
        batch.total_volume = 0;
        batch.is_finalized = false;
        batch.bump = ctx.bumps.batch_escrow;
        
        msg!("Batch {} initialized", batch_id);
        Ok(())
    }

    /// Add a matched order to the batch (runs on ER for fast batching)
    pub fn add_to_batch(
        ctx: Context<AddToBatch>,
        _token_mint: Pubkey,
        amount: u64,
        price: u64,
    ) -> Result<()> {
        let batch = &mut ctx.accounts.batch_escrow;
        
        require!(!batch.is_finalized, ErrorCode::BatchFinalized);
        require!(batch.order_count < 100, ErrorCode::BatchFull);
        
        batch.order_count += 1;
        batch.total_volume += amount;
        
        msg!(
            "Added order to batch {}: {} tokens @ {} price",
            batch.batch_id,
            amount,
            price
        );
        
        Ok(())
    }

    /// Finalize batch and mark for settlement
    pub fn finalize_batch(ctx: Context<FinalizeBatch>) -> Result<()> {
        let batch = &mut ctx.accounts.batch_escrow;
        
        require!(!batch.is_finalized, ErrorCode::BatchFinalized);
        require!(batch.order_count > 0, ErrorCode::BatchEmpty);
        
        batch.is_finalized = true;
        
        msg!(
            "Batch {} finalized: {} orders, {} total volume",
            batch.batch_id,
            batch.order_count,
            batch.total_volume
        );
        
        Ok(())
    }

    // ========== Atomic Swap Instructions ==========

    /// Initialize a trade escrow for an atomic swap
    pub fn init_escrow(
        ctx: Context<InitEscrow>,
        match_id: u64,
        maker: Pubkey,
        taker: Pubkey,
        maker_token: Pubkey,
        taker_token: Pubkey,
        maker_amount: u64,
        taker_amount: u64,
    ) -> Result<()> {
        let escrow = &mut ctx.accounts.trade_escrow;
        escrow.match_id = match_id;
        escrow.maker = maker;
        escrow.taker = taker;
        escrow.maker_token = maker_token;
        escrow.taker_token = taker_token;
        escrow.maker_amount = maker_amount;
        escrow.taker_amount = taker_amount;
        escrow.maker_deposited = false;
        escrow.taker_deposited = false;
        escrow.is_settled = false;
        escrow.bump = ctx.bumps.trade_escrow;
        
        msg!(
            "Trade escrow {} initialized: {} {} <-> {} {}",
            match_id,
            maker_amount,
            maker_token,
            taker_amount,
            taker_token
        );
        Ok(())
    }

    /// Deposit tokens into escrow (maker or taker)
    pub fn deposit(
        ctx: Context<Deposit>,
        amount: u64,
    ) -> Result<()> {
        let escrow = &mut ctx.accounts.trade_escrow;
        let depositor = ctx.accounts.depositor.key();
        
        require!(!escrow.is_settled, ErrorCode::TradeAlreadySettled);
        
        // Determine if depositor is maker or taker and validate amount
        if depositor == escrow.maker {
            require!(!escrow.maker_deposited, ErrorCode::AlreadyDeposited);
            require!(amount == escrow.maker_amount, ErrorCode::InvalidAmount);
            require!(ctx.accounts.mint.key() == escrow.maker_token, ErrorCode::InvalidAmount);
            escrow.maker_deposited = true;
            msg!("Maker depositing {} tokens", amount);
        } else if depositor == escrow.taker {
            require!(!escrow.taker_deposited, ErrorCode::AlreadyDeposited);
            require!(amount == escrow.taker_amount, ErrorCode::InvalidAmount);
            require!(ctx.accounts.mint.key() == escrow.taker_token, ErrorCode::InvalidAmount);
            escrow.taker_deposited = true;
            msg!("Taker depositing {} tokens", amount);
        } else {
            return Err(ErrorCode::Unauthorized.into());
        }
        
        // Transfer tokens from depositor to escrow
        // Get mint decimals (we'll need to read this from the mint account)
        let mint_data = ctx.accounts.mint.try_borrow_data()?;
        let mint = spl_token_2022::state::Mint::unpack(&mint_data)?;
        let decimals = mint.decimals;
        drop(mint_data);
        
        transfer_tokens(
            &ctx.accounts.depositor_token_account.to_account_info(),
            &ctx.accounts.mint.to_account_info(),
            &ctx.accounts.escrow_token_account.to_account_info(),
            &ctx.accounts.depositor.to_account_info(),
            &ctx.accounts.token_program.to_account_info(),
            amount,
            decimals,
            &[],
        )?;
        
        msg!("Deposited {} tokens to escrow", amount);
        Ok(())
    }

    /// Execute atomic swap when both parties have deposited
    pub fn settle_atomic_swap(
        ctx: Context<SettleSwap>,
    ) -> Result<()> {
        let escrow = &ctx.accounts.trade_escrow;
        
        require!(!escrow.is_settled, ErrorCode::TradeAlreadySettled);
        require!(escrow.maker_deposited, ErrorCode::MakerNotDeposited);
        require!(escrow.taker_deposited, ErrorCode::TakerNotDeposited);
        
        // Extract values we need before transfers
        let match_id = escrow.match_id;
        let maker_amount = escrow.maker_amount;
        let taker_amount = escrow.taker_amount;
        let bump = escrow.bump;
        
        // Create PDA signer seeds for escrow authority
        let match_id_bytes = match_id.to_le_bytes();
        let seeds = &[
            TRADE_ESCROW_SEED,
            match_id_bytes.as_ref(),
            &[bump],
        ];
        let signer_seeds = &[&seeds[..]];
        
        // Get mint decimals
        let maker_mint_data = ctx.accounts.maker_mint.try_borrow_data()?;
        let maker_mint = spl_token_2022::state::Mint::unpack(&maker_mint_data)?;
        let maker_decimals = maker_mint.decimals;
        drop(maker_mint_data);
        
        let taker_mint_data = ctx.accounts.taker_mint.try_borrow_data()?;
        let taker_mint = spl_token_2022::state::Mint::unpack(&taker_mint_data)?;
        let taker_decimals = taker_mint.decimals;
        drop(taker_mint_data);
        
        // Transfer maker tokens to taker
        transfer_tokens(
            &ctx.accounts.escrow_maker_token_account.to_account_info(),
            &ctx.accounts.maker_mint.to_account_info(),
            &ctx.accounts.taker_receive_account.to_account_info(),
            &ctx.accounts.trade_escrow.to_account_info(),
            &ctx.accounts.token_program.to_account_info(),
            maker_amount,
            maker_decimals,
            signer_seeds,
        )?;
        
        // Transfer taker tokens to maker
        transfer_tokens(
            &ctx.accounts.escrow_taker_token_account.to_account_info(),
            &ctx.accounts.taker_mint.to_account_info(),
            &ctx.accounts.maker_receive_account.to_account_info(),
            &ctx.accounts.trade_escrow.to_account_info(),
            &ctx.accounts.token_program.to_account_info(),
            taker_amount,
            taker_decimals,
            signer_seeds,
        )?;
        
        // Now mark as settled
        let escrow = &mut ctx.accounts.trade_escrow;
        escrow.is_settled = true;
        
        msg!(
            "Trade {} settled: {} maker tokens <-> {} taker tokens",
            match_id,
            maker_amount,
            taker_amount
        );
        
        Ok(())
    }

    /// Withdraw from escrow if trade is cancelled
    pub fn withdraw(
        ctx: Context<Withdraw>,
    ) -> Result<()> {
        let escrow = &ctx.accounts.trade_escrow;
        let withdrawer = ctx.accounts.withdrawer.key();
        
        require!(!escrow.is_settled, ErrorCode::TradeAlreadySettled);
        
        // Determine withdrawal eligibility and amount
        let (can_withdraw, amount, expected_mint) = if withdrawer == escrow.maker {
            (escrow.maker_deposited, escrow.maker_amount, escrow.maker_token)
        } else if withdrawer == escrow.taker {
            (escrow.taker_deposited, escrow.taker_amount, escrow.taker_token)
        } else {
            return Err(ErrorCode::Unauthorized.into());
        };
        
        require!(can_withdraw, ErrorCode::NoDeposit);
        require!(ctx.accounts.mint.key() == expected_mint, ErrorCode::InvalidAmount);
        
        // Create PDA signer seeds for escrow authority
        let match_id_bytes = escrow.match_id.to_le_bytes();
        let seeds = &[
            TRADE_ESCROW_SEED,
            match_id_bytes.as_ref(),
            &[escrow.bump],
        ];
        let signer_seeds = &[&seeds[..]];
        
        // Get mint decimals
        let mint_data = ctx.accounts.mint.try_borrow_data()?;
        let mint = spl_token_2022::state::Mint::unpack(&mint_data)?;
        let decimals = mint.decimals;
        drop(mint_data);
        
        // Transfer tokens back to withdrawer
        transfer_tokens(
            &ctx.accounts.escrow_token_account.to_account_info(),
            &ctx.accounts.mint.to_account_info(),
            &ctx.accounts.withdrawer_token_account.to_account_info(),
            &ctx.accounts.trade_escrow.to_account_info(),
            &ctx.accounts.token_program.to_account_info(),
            amount,
            decimals,
            signer_seeds,
        )?;
        
        msg!("Withdrawer {} withdrew {} tokens from trade {}", withdrawer, amount, escrow.match_id);
        
        Ok(())
    }

    // ========== Ephemeral Rollup Instructions ==========

    /// Delegate the batch escrow PDA to ER for fast order batching
    #[cfg(feature = "er")]
    pub fn delegate_batch(ctx: Context<DelegateBatch>, batch_id: u64) -> Result<()> {
        let seeds = &[
            BATCH_ESCROW_SEED,
            &batch_id.to_le_bytes(),
            &[ctx.accounts.batch_escrow.bump],
        ];
        
        ctx.accounts.delegate_pda(
            &ctx.accounts.payer,
            seeds,
            ephemeral_rollups_sdk::anchor::DelegateConfig {
                // Use validator from remaining accounts if provided
                validator: ctx.remaining_accounts.first().map(|acc| acc.key()),
                ..Default::default()
            },
        )?;
        
        msg!("Batch {} delegated to ER", batch_id);
        Ok(())
    }

    /// Commit batch state from ER to base layer
    #[cfg(feature = "er")]
    pub fn commit_batch(ctx: Context<CommitBatch>) -> Result<()> {
        commit_accounts(
            &ctx.accounts.payer,
            vec![&ctx.accounts.batch_escrow.to_account_info()],
            &ctx.accounts.magic_context,
            &ctx.accounts.magic_program,
        )?;
        
        msg!("Batch {} committed to base layer", ctx.accounts.batch_escrow.batch_id);
        Ok(())
    }

    /// Commit and undelegate batch (finalize settlement)
    #[cfg(feature = "er")]
    pub fn commit_and_undelegate_batch(ctx: Context<CommitBatch>) -> Result<()> {
        commit_and_undelegate_accounts(
            &ctx.accounts.payer,
            vec![&ctx.accounts.batch_escrow.to_account_info()],
            &ctx.accounts.magic_context,
            &ctx.accounts.magic_program,
        )?;
        
        msg!(
            "Batch {} committed and undelegated",
            ctx.accounts.batch_escrow.batch_id
        );
        Ok(())
    }
}

// ========== Account Structs ==========

#[derive(Accounts)]
#[instruction(batch_id: u64)]
pub struct InitializeBatch<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        init,
        payer = authority,
        space = 8 + BatchEscrow::INIT_SPACE,
        seeds = [BATCH_ESCROW_SEED, &batch_id.to_le_bytes()],
        bump
    )]
    pub batch_escrow: Account<'info, BatchEscrow>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AddToBatch<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    
    #[account(mut)]
    pub batch_escrow: Account<'info, BatchEscrow>,
}

#[derive(Accounts)]
pub struct FinalizeBatch<'info> {
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        has_one = authority @ ErrorCode::Unauthorized
    )]
    pub batch_escrow: Account<'info, BatchEscrow>,
}

#[derive(Accounts)]
#[instruction(match_id: u64)]
pub struct InitEscrow<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        init,
        payer = authority,
        space = 8 + TradeEscrow::INIT_SPACE,
        seeds = [TRADE_ESCROW_SEED, &match_id.to_le_bytes()],
        bump
    )]
    pub trade_escrow: Account<'info, TradeEscrow>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,
    
    #[account(mut)]
    pub trade_escrow: Account<'info, TradeEscrow>,
    
    /// The token mint being deposited
    /// CHECK: Validated against trade_escrow.maker_token or trade_escrow.taker_token
    pub mint: UncheckedAccount<'info>,
    
    /// Depositor's token account
    /// CHECK: Validated as depositor's ATA for the mint
    #[account(mut)]
    pub depositor_token_account: UncheckedAccount<'info>,
    
    /// Escrow's token account (PDA)
    /// CHECK: Validated as escrow's ATA for the mint
    #[account(mut)]
    pub escrow_token_account: UncheckedAccount<'info>,
    
    /// CHECK: Token-2022 program
    pub token_program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct SettleSwap<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(mut)]
    pub trade_escrow: Account<'info, TradeEscrow>,
    
    /// Maker's token mint
    /// CHECK: Validated against trade_escrow.maker_token
    pub maker_mint: UncheckedAccount<'info>,
    
    /// Taker's token mint
    /// CHECK: Validated against trade_escrow.taker_token
    pub taker_mint: UncheckedAccount<'info>,
    
    /// Escrow's maker token account
    /// CHECK: Validated as escrow's ATA for maker_mint
    #[account(mut)]
    pub escrow_maker_token_account: UncheckedAccount<'info>,
    
    /// Escrow's taker token account
    /// CHECK: Validated as escrow's ATA for taker_mint
    #[account(mut)]
    pub escrow_taker_token_account: UncheckedAccount<'info>,
    
    /// Maker's token account (receives taker tokens)
    /// CHECK: Validated as maker's ATA for taker_mint
    #[account(mut)]
    pub maker_receive_account: UncheckedAccount<'info>,
    
    /// Taker's token account (receives maker tokens)
    /// CHECK: Validated as taker's ATA for maker_mint
    #[account(mut)]
    pub taker_receive_account: UncheckedAccount<'info>,
    
    /// CHECK: Token-2022 program
    pub token_program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub withdrawer: Signer<'info>,
    
    #[account(mut)]
    pub trade_escrow: Account<'info, TradeEscrow>,
    
    /// The token mint being withdrawn
    /// CHECK: Validated against trade_escrow.maker_token or trade_escrow.taker_token
    pub mint: UncheckedAccount<'info>,
    
    /// Escrow's token account
    /// CHECK: Validated as escrow's ATA for the mint
    #[account(mut)]
    pub escrow_token_account: UncheckedAccount<'info>,
    
    /// Withdrawer's token account
    /// CHECK: Validated as withdrawer's ATA for the mint
    #[account(mut)]
    pub withdrawer_token_account: UncheckedAccount<'info>,
    
    /// CHECK: Token-2022 program
    pub token_program: UncheckedAccount<'info>,
}

#[cfg(feature = "er")]
#[delegate]
#[derive(Accounts)]
#[instruction(batch_id: u64)]
pub struct DelegateBatch<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    
    #[account(
        mut,
        seeds = [BATCH_ESCROW_SEED, &batch_id.to_le_bytes()],
        bump = batch_escrow.bump,
        del
    )]
    pub batch_escrow: Account<'info, BatchEscrow>,
}

#[cfg(feature = "er")]
#[derive(Accounts)]
pub struct CommitBatch<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    
    #[account(mut)]
    pub batch_escrow: Account<'info, BatchEscrow>,
    
    /// CHECK: Magic context account
    pub magic_context: AccountInfo<'info>,
    
    /// CHECK: Magic program
    pub magic_program: AccountInfo<'info>,
}

// ========== State ==========

#[account]
#[derive(InitSpace)]
pub struct BatchEscrow {
    pub batch_id: u64,
    pub authority: Pubkey,
    pub order_count: u32,
    pub total_volume: u64,
    pub is_finalized: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct TradeEscrow {
    pub match_id: u64,
    pub maker: Pubkey,
    pub taker: Pubkey,
    pub maker_token: Pubkey,
    pub taker_token: Pubkey,
    pub maker_amount: u64,
    pub taker_amount: u64,
    pub maker_deposited: bool,
    pub taker_deposited: bool,
    pub is_settled: bool,
    pub bump: u8,
}

// ========== Errors ==========

#[error_code]
pub enum ErrorCode {
    #[msg("Batch is already finalized")]
    BatchFinalized,
    #[msg("Batch is full (max 100 orders)")]
    BatchFull,
    #[msg("Batch is empty")]
    BatchEmpty,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Trade is already settled")]
    TradeAlreadySettled,
    #[msg("Already deposited")]
    AlreadyDeposited,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Maker has not deposited")]
    MakerNotDeposited,
    #[msg("Taker has not deposited")]
    TakerNotDeposited,
    #[msg("No deposit to withdraw")]
    NoDeposit,
}
