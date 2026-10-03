use anchor_lang::prelude::*;


use crate::state::merchant::Merchant;
use crate::state::payment::Payment;
use crate::constants::{PAYMENT_SEED, ORACLE_AUTHORITY};

#[derive(Accounts)]
#[instruction(reference_hash: [u8; 32])]
pub struct CreatePayment<'info>{
    #[account(
        mut,
        address = ORACLE_AUTHORITY,
    )]
    pub payer: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = 8 + Payment::INIT_SPACE,
        seeds = [PAYMENT_SEED, merchant.key().as_ref(), reference_hash.as_ref()],
        bump,
    )]
    pub payment: Account<'info, Payment>,
    pub merchant: Account<'info, Merchant>,
    pub system_program: Program<'info, System>,
}

pub fn create_payment_record(
    ctx: Context<CreatePayment>,
    _reference_hash: [u8; 32],  
    amount: u64,
    mint: Pubkey
) -> Result<()> {
    ctx.accounts.payment.merchant = ctx.accounts.merchant.key();
    ctx.accounts.payment.amount = amount;
    ctx.accounts.payment.mint = mint;
    ctx.accounts.payment.is_paid = false;
    ctx.accounts.payment.bump = ctx.bumps.payment;

    Ok(())
}