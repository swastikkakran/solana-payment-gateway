use anchor_lang::prelude::*;

use crate::{state::merchant::Merchant};

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = 8 + Merchant::INIT_SPACE,
        seeds = [b"merchant", payer.key().as_ref()],
        bump
    )]
    pub merchant: Account<'info, Merchant>,
    pub system_program: Program<'info, System>,
}

pub fn initialize_merchant(ctx: Context<Initialize>) -> Result<()> {
    ctx.accounts.merchant.payout_wallet = ctx.accounts.payer.key();
    ctx.accounts.merchant.bump = ctx.bumps.merchant;
    ctx.accounts.merchant.is_active = true;

    Ok(())
}
