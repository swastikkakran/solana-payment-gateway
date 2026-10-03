use anchor_lang::prelude::*;

use crate::state::merchant::Merchant;
use crate::state::payment::Payment;
use crate::constants::{PAYMENT_SEED, ORACLE_AUTHORITY};


#[derive(Accounts)]
#[instruction(reference_hash: [u8; 32])]
pub struct MarkPaid<'info> {
    #[account(
        mut,
        address = ORACLE_AUTHORITY
    )]
    pub payer: Signer<'info>,
    #[account(
        mut,
        seeds = [PAYMENT_SEED, merchant.key().as_ref(), reference_hash.as_ref()],
        bump = payment.bump,
    )]
    pub payment: Account<'info, Payment>,
    pub merchant: Account<'info, Merchant>,
}

pub fn mark_payment_paid(
    ctx: Context<MarkPaid>,
    _reference_hash: [u8; 32],
) -> Result<()> {
    ctx.accounts.payment.is_paid = true;

    Ok(())
}