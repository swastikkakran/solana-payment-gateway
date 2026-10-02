use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Signer is not the authorized payout wallet!")]
    UnauthorizedPayoutWallet,
}
