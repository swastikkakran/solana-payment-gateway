use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Merchant {
    pub payout_wallet: Pubkey,
    pub is_active: bool,
    pub bump: u8,
}
