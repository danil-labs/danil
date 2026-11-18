//! The Terminus window. It is a client of an external engine (`danil-engine`)
//! selected at launch; the domain lives in the engine, not here.

mod console;
mod extracted;
pub use extracted::{background_dispatch, bundled_engine};
pub use extracted::{env, run, util};
pub use extracted::{launch, stop_engine};
