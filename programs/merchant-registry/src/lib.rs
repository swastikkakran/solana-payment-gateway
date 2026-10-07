    pub mod constants;
    pub mod error;
    pub mod instructions;
    pub mod state;

    use anchor_lang::prelude::*;

    pub use constants::*;
    pub use instructions::*;

    declare_id!("8v5vhk23UWumv3ReypP8hetreRsLFMcACDhrn2mZb38b");

    #[program]
    pub mod merchant_registry {
        use super::*;

        pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
            crate::instructions::initialize::initialize_merchant(ctx)
        }

        pub fn update(ctx: Context<Update>) -> Result<()> {
            crate::instructions::update::update_account(ctx)
        }

        pub fn create_payment(ctx: Context<CreatePayment>, reference_hash: [u8; 32], amount: u64, mint: Pubkey) -> Result<()> {
            crate::instructions::initialize_payment::create_payment_record(ctx, reference_hash, amount, mint)
        }

        pub fn mark_paid(ctx: Context<MarkPaid>, reference_hash: [u8; 32]) -> Result<()> {
            crate::instructions::mark_payment_paid(ctx, reference_hash)
        }

    }
