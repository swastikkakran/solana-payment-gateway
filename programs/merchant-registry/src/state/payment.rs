use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Payment {
    pub merchant: Pubkey,
    pub amount: u64,
    pub mint: Pubkey,
    pub is_paid: bool,
    pub bump: u8
}