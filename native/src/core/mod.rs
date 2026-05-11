mod kill;
mod process;
mod protocol;

pub use kill::{
    is_missing_process_error, kill_pid, pid_exists, signal_label, signal_number, SIGKILL_NUMBER,
    SIGTERM_NUMBER,
};
pub use process::{dedupe_pids, dedupe_processes, PortProcess};
pub use protocol::{ProcessProtocol, Protocol};

pub trait PortProcessFinder {
    fn find_port_processes(port: u16, protocol: Protocol) -> Result<Vec<PortProcess>, String>;
}

pub trait ProcessKiller {
    fn kill_pid(pid: u32, signal: i32) -> Result<(), String>;
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

pub fn find_port_processes(port: u16, protocol: Protocol) -> Result<Vec<PortProcess>, String> {
    let mut processes = crate::platform::find_port_processes(port, protocol)?;
    processes.retain(|process| protocol.matches(process.protocol));
    dedupe_processes(&mut processes);
    Ok(processes)
}

pub fn find_pids_by_port(port: u16, protocol: Protocol) -> Result<Vec<u32>, String> {
    let processes = find_port_processes(port, protocol)?;
    Ok(dedupe_pids(&processes))
}
