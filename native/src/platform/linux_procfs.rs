use crate::core::{PortProcess, ProcessProtocol, Protocol};
use std::collections::HashMap;
use std::fs;
use std::path::Path;

pub fn find_port_processes(port: u16, protocol: Protocol) -> Result<Vec<PortProcess>, String> {
    let mut socket_inodes = HashMap::new();

    if matches!(protocol, Protocol::Tcp | Protocol::All) {
        collect_inodes(
            "/proc/net/tcp",
            port,
            true,
            ProcessProtocol::Tcp,
            &mut socket_inodes,
        )?;
        collect_inodes(
            "/proc/net/tcp6",
            port,
            true,
            ProcessProtocol::Tcp,
            &mut socket_inodes,
        )?;
    }

    if matches!(protocol, Protocol::Udp | Protocol::All) {
        collect_inodes(
            "/proc/net/udp",
            port,
            false,
            ProcessProtocol::Udp,
            &mut socket_inodes,
        )?;
        collect_inodes(
            "/proc/net/udp6",
            port,
            false,
            ProcessProtocol::Udp,
            &mut socket_inodes,
        )?;
    }

    if socket_inodes.is_empty() {
        return Ok(Vec::new());
    }

    let mut processes = Vec::new();
    for entry in fs::read_dir("/proc").map_err(|error| error.to_string())? {
        let Ok(entry) = entry else {
            continue;
        };

        let file_name = entry.file_name();
        let Some(pid_text) = file_name.to_str() else {
            continue;
        };

        let Ok(pid) = pid_text.parse::<u32>() else {
            continue;
        };

        if pid == std::process::id() {
            continue;
        }

        let matches = process_socket_protocols(pid, &socket_inodes);
        if matches.is_empty() {
            continue;
        }

        let command = process_command(pid);
        let path = process_path(pid);
        for process_protocol in matches {
            processes.push(
                PortProcess::new(pid, port, process_protocol)
                    .with_metadata(command.clone(), path.clone()),
            );
        }
    }

    Ok(processes)
}

fn collect_inodes(
    path: &str,
    port: u16,
    tcp_only_listen: bool,
    protocol: ProcessProtocol,
    socket_inodes: &mut HashMap<String, ProcessProtocol>,
) -> Result<(), String> {
    let content = match fs::read_to_string(path) {
        Ok(content) => content,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error.to_string()),
    };

    for line in content.lines().skip(1) {
        let columns = line.split_whitespace().collect::<Vec<_>>();
        if columns.len() < 10 {
            continue;
        }

        if tcp_only_listen && columns[3] != "0A" {
            continue;
        }

        let Some(local_port_hex) = columns[1].rsplit_once(':').map(|(_, port)| port) else {
            continue;
        };

        let Ok(local_port) = u16::from_str_radix(local_port_hex, 16) else {
            continue;
        };

        if local_port == port {
            socket_inodes.insert(columns[9].to_string(), protocol);
        }
    }

    Ok(())
}

fn process_socket_protocols(
    pid: u32,
    socket_inodes: &HashMap<String, ProcessProtocol>,
) -> Vec<ProcessProtocol> {
    let fd_path = format!("/proc/{pid}/fd");
    let Ok(entries) = fs::read_dir(fd_path) else {
        return Vec::new();
    };

    let mut protocols = Vec::new();
    for entry in entries.flatten() {
        let Ok(target) = fs::read_link(entry.path()) else {
            continue;
        };

        if let Some(protocol) = socket_target_protocol(&target, socket_inodes) {
            protocols.push(protocol);
        }
    }

    protocols.sort_unstable();
    protocols.dedup();
    protocols
}

fn socket_target_protocol(
    path: &Path,
    socket_inodes: &HashMap<String, ProcessProtocol>,
) -> Option<ProcessProtocol> {
    let target = path.to_str()?;
    let inode = target
        .strip_prefix("socket:[")
        .and_then(|value| value.strip_suffix(']'))?;

    socket_inodes.get(inode).copied()
}

fn process_command(pid: u32) -> Option<String> {
    let value = fs::read_to_string(format!("/proc/{pid}/comm")).ok()?;
    non_empty(value.trim())
}

fn process_path(pid: u32) -> Option<String> {
    let path = fs::read_link(format!("/proc/{pid}/exe")).ok()?;
    non_empty(path.to_string_lossy().trim())
}

fn non_empty(value: &str) -> Option<String> {
    if value.is_empty() {
        None
    } else {
        Some(value.to_string())
    }
}
