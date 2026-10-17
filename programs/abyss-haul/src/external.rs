//! Hand-written adapters for external programs. The official crates target older Solana/Anchor
//! versions, so the few instructions and account layouts we use are encoded here directly from
//! mpl-core 0.12.1 and switchboard-on-demand 0.13.0, and tested against the real Core binary.

pub mod core;
pub mod switchboard;
