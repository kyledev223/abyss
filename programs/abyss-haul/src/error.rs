use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    // Reward engine
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("This harbor already has an active boost")]
    BoostAlreadyActive,
    #[msg("Boost must end on a future hour within the boost ring")]
    InvalidBoostWindow,
    #[msg("Boost ring slot is held by a different hour")]
    BoostRingCollision,
    #[msg("Insufficient docked depth")]
    InsufficientDepth,

    // Access and configuration
    #[msg("Only the admin can do this")]
    NotAdmin,
    #[msg("Only the pending admin can accept")]
    NotPendingAdmin,
    #[msg("Only the program upgrade authority can initialize")]
    NotUpgradeAuthority,
    #[msg("Configuration value out of bounds")]
    InvalidParams,
    #[msg("Minting is paused")]
    MintPaused,
    #[msg("Upgrades are paused")]
    UpgradesPaused,

    // Fleet
    #[msg("Fleet is at its live supply cap")]
    SupplyCapReached,
    #[msg("You do not own this sub")]
    NotOwner,
    #[msg("Sub is not in the required state")]
    WrongSubState,
    #[msg("Harbor has no free dock slot")]
    HarborFull,
    #[msg("Harbor is at its maximum size")]
    HarborMaxed,
    #[msg("Sub is already at max reinforce level")]
    MaxLevel,
    #[msg("Subs must be different, of the same tier, and below the top tier")]
    InvalidMerge,
    #[msg("Not a valid Metaplex Core asset")]
    InvalidAsset,
    #[msg("Vault cannot pay without dropping below rent exemption")]
    VaultBelowRent,
    #[msg("Rent deposit does not cover reveal costs")]
    RentDepositTooSmall,

    // Randomness and expeditions
    #[msg("Randomness not revealed yet")]
    RandomnessNotRevealed,
    #[msg("Expedition length must be 1 to 6 hours")]
    InvalidExpeditionHours,
    #[msg("Harbor already has a sub on an expedition")]
    ExpeditionActive,
    #[msg("Next expedition is not available yet")]
    ExpeditionCooldown,
    #[msg("Sub has not returned yet")]
    StillAway,
}
