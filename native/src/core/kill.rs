pub const SIGKILL_NUMBER: i32 = 9;
pub const SIGTERM_NUMBER: i32 = 15;

pub fn signal_number(signal: &str) -> Result<i32, String> {
    let normalized = signal.trim().trim_start_matches('-').to_ascii_uppercase();
    if normalized.is_empty() {
        return Err("signal is required".to_string());
    }

    if let Ok(number) = normalized.parse::<i32>() {
        if number > 0 {
            return Ok(number);
        }
    }

    let name = normalized.strip_prefix("SIG").unwrap_or(&normalized);
    match name {
        "TERM" => Ok(SIGTERM_NUMBER),
        "KILL" => Ok(SIGKILL_NUMBER),
        "INT" => Ok(2),
        "HUP" => Ok(1),
        "QUIT" => Ok(3),
        _ => Err(format!("unsupported signal: {signal}")),
    }
}

pub fn signal_label(signal: i32) -> String {
    match signal {
        1 => "SIGHUP".to_string(),
        2 => "SIGINT".to_string(),
        3 => "SIGQUIT".to_string(),
        SIGKILL_NUMBER => "SIGKILL".to_string(),
        SIGTERM_NUMBER => "SIGTERM".to_string(),
        value => value.to_string(),
    }
}

#[cfg(unix)]
pub fn kill_pid(pid: u32, signal: i32) -> Result<(), String> {
    unsafe {
        if kill(pid as i32, signal) == 0 {
            Ok(())
        } else {
            Err(std::io::Error::last_os_error().to_string())
        }
    }
}

#[cfg(unix)]
pub fn pid_exists(pid: u32) -> bool {
    unsafe {
        if kill(pid as i32, 0) == 0 {
            return true;
        }
    }

    let error = std::io::Error::last_os_error();
    error.raw_os_error() != Some(ESRCH)
}

#[cfg(unix)]
pub fn is_missing_process_error(message: &str) -> bool {
    message.contains("No such process") || message.contains("os error 3")
}

#[cfg(unix)]
const ESRCH: i32 = 3;

#[cfg(unix)]
extern "C" {
    fn kill(pid: i32, sig: i32) -> i32;
}

#[cfg(windows)]
pub fn kill_pid(pid: u32, _signal: i32) -> Result<(), String> {
    let handle = unsafe { OpenProcess(PROCESS_TERMINATE, 0, pid) };
    if handle == 0 {
        return Err(std::io::Error::last_os_error().to_string());
    }

    let terminated = unsafe { TerminateProcess(handle, 1) != 0 };
    unsafe {
        CloseHandle(handle);
    }

    if terminated {
        Ok(())
    } else {
        Err(std::io::Error::last_os_error().to_string())
    }
}

#[cfg(windows)]
pub fn pid_exists(pid: u32) -> bool {
    let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
    if handle == 0 {
        return false;
    }

    unsafe {
        CloseHandle(handle);
    }
    true
}

#[cfg(windows)]
pub fn is_missing_process_error(_message: &str) -> bool {
    false
}

#[cfg(windows)]
const PROCESS_TERMINATE: u32 = 0x0001;
#[cfg(windows)]
const PROCESS_QUERY_LIMITED_INFORMATION: u32 = 0x1000;

#[cfg(windows)]
type Handle = isize;

#[cfg(windows)]
#[link(name = "kernel32")]
extern "system" {
    fn OpenProcess(desired_access: u32, inherit_handle: i32, process_id: u32) -> Handle;
    fn TerminateProcess(process: Handle, exit_code: u32) -> i32;
    fn CloseHandle(object: Handle) -> i32;
}
