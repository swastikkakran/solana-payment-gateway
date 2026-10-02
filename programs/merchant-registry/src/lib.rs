pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;

declare_id!("4BTPQXTtfaZd5zwNLXJTwXMywPioEzuxJPyMFzkEt9K8");

#[program]
pub mod merchant_registry {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        crate::instructions::initialize::initialize_merchant(ctx)
    }

    pub fn update(ctx: Context<Update>) -> Result<()> {
        crate::instructions::update::update_account(ctx)
    }

}
