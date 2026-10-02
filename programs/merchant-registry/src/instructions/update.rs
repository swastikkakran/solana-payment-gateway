use anchor_lang::prelude::*;
use crate::state::merchant::Merchant;
use crate::error::ErrorCode::UnauthorizedPayoutWallet;


#[derive(Accounts)]
pub struct Update<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        constraint = merchant.payout_wallet == payer.key() @ UnauthorizedPayoutWallet,
        seeds = [b"merchant", payer.key().as_ref()],
        bump = merchant.bump,
    )]
    pub merchant: Account<'info, Merchant>,
}

pub fn update_account(ctx: Context<Update>) -> Result<()> {
    ctx.accounts.merchant.is_active = !ctx.accounts.merchant.is_active;

    Ok(())
}