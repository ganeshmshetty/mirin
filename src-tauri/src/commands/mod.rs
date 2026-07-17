pub mod apps;
pub mod console;
pub mod device;
pub mod files;
pub mod scrcpy;
pub mod settings;

// Re-export commands for easy access
pub use apps::*;
pub use console::*;
pub use device::*;
pub use files::*;
pub use scrcpy::*;
pub use settings::*;
