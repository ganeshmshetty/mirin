pub mod device;
pub mod scrcpy;
pub mod settings;
pub mod apps;
pub mod files;
pub mod console;

// Re-export commands for easy access
pub use device::*;
pub use scrcpy::*;
pub use settings::*;
pub use apps::*;
pub use files::*;
pub use console::*;
