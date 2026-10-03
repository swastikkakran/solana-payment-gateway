use anchor_lang::prelude::*;

use crate::state::merchant::Merchant;
use crate::error::ErrorCode::UnauthorizedPayoutWallet;
use crate::constants::MERCHANT_SEED;


#[derive(Accounts)]
pub struct Update<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        constraint = merchant.payout_wallet == payer.key() @ UnauthorizedPayoutWallet,
        seeds = [MERCHANT_SEED, payer.key().as_ref()],
        bump = merchant.bump,
    )]
    pub merchant: Account<'info, Merchant>,
}

pub fn update_account(ctx: Context<Update>) -> Result<()> {
    ctx.accounts.merchant.is_active = !ctx.accounts.merchant.is_active;

    Ok(())
}