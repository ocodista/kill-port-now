#[cfg(target_os = "linux")]
mod linux_procfs;
#[cfg(target_os = "macos")]
mod macos_libproc;
#[cfg(target_os = "windows")]
mod windows_iphlpapi;

#[cfg(target_os = "linux")]
pub use linux_procfs::find_port_processes;
#[cfg(target_os = "macos")]
pub use macos_libproc::find_port_processes;
#[cfg(target_os = "windows")]
pub use windows_iphlpapi::find_port_processes;
