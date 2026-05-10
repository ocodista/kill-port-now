pub mod ports;

#[cfg(target_os = "macos")]
mod macos;

#[cfg(target_os = "linux")]
mod linux;

#[cfg(target_os = "macos")]
pub use macos::find_pids_by_port;

#[cfg(target_os = "linux")]
pub use linux::find_pids_by_port;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Protocol {
    Tcp,
    Udp,
    All,
}

impl Protocol {
    pub fn parse(value: &str) -> Result<Self, String> {
        match value.to_ascii_lowercase().as_str() {
            "tcp" => Ok(Self::Tcp),
            "udp" => Ok(Self::Udp),
            "all" => Ok(Self::All),
            _ => Err(format!("invalid protocol: {value}")),
        }
    }
}

pub fn parse_port(value: &str) -> Result<u16, String> {
    let port = value
        .trim()
        .parse::<u16>()
        .map_err(|_| format!("invalid port: {value}"))?;

    if port == 0 {
        return Err("port must be between 1 and 65535".to_string());
    }

    Ok(port)
}

pub fn parse_ports(values: &[String]) -> Result<Vec<u16>, String> {
    let mut ports = Vec::new();

    for value in values {
        for part in value.split(',') {
            let text = part.trim();
            if text.is_empty() {
                continue;
            }

            let port = parse_port(text)?;
            if !ports.contains(&port) {
                ports.push(port);
            }
        }
    }

    if ports.is_empty() {
        return Err("at least one port is required".to_string());
    }

    Ok(ports)
}

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
        "TERM" => Ok(15),
        "KILL" => Ok(9),
        "INT" => Ok(2),
        "HUP" => Ok(1),
        "QUIT" => Ok(3),
        _ => Err(format!("unsupported signal: {signal}")),
    }
}

pub fn kill_pid(pid: i32, signal: i32) -> Result<(), String> {
    unsafe {
        if kill(pid, signal) == 0 {
            Ok(())
        } else {
            Err(std::io::Error::last_os_error().to_string())
        }
    }
}

extern "C" {
    fn kill(pid: i32, sig: i32) -> i32;
}
