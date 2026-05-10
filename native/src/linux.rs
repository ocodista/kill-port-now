use crate::Protocol;
use std::collections::HashSet;
use std::fs;
use std::path::Path;

pub fn find_pids_by_port(port: u16, protocol: Protocol) -> Result<Vec<i32>, String> {
    let mut socket_inodes = HashSet::new();

    if matches!(protocol, Protocol::Tcp | Protocol::All) {
        collect_inodes("/proc/net/tcp", port, true, &mut socket_inodes)?;
        collect_inodes("/proc/net/tcp6", port, true, &mut socket_inodes)?;
    }

    if matches!(protocol, Protocol::Udp | Protocol::All) {
        collect_inodes("/proc/net/udp", port, false, &mut socket_inodes)?;
        collect_inodes("/proc/net/udp6", port, false, &mut socket_inodes)?;
    }

    let mut pids = Vec::new();
    for entry in fs::read_dir("/proc").map_err(|error| error.to_string())? {
        let Ok(entry) = entry else {
            continue;
        };

        let file_name = entry.file_name();
        let Some(pid_text) = file_name.to_str() else {
            continue;
        };

        let Ok(pid) = pid_text.parse::<i32>() else {
            continue;
        };

        if pid == std::process::id() as i32 {
            continue;
        }

        if process_has_inode(pid, &socket_inodes) {
            pids.push(pid);
        }
    }

    pids.sort_unstable();
    pids.dedup();
    Ok(pids)
}

fn collect_inodes(
    path: &str,
    port: u16,
    tcp_only_listen: bool,
    socket_inodes: &mut HashSet<String>,
) -> Result<(), String> {
    let content = match fs::read_to_string(path) {
        Ok(content) => content,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error.to_string()),
    };

    for line in content.lines().skip(1) {
        let columns: Vec<&str> = line.split_whitespace().collect();
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
            socket_inodes.insert(columns[9].to_string());
        }
    }

    Ok(())
}

fn process_has_inode(pid: i32, socket_inodes: &HashSet<String>) -> bool {
    if socket_inodes.is_empty() {
        return false;
    }

    let fd_path = format!("/proc/{pid}/fd");
    let Ok(entries) = fs::read_dir(fd_path) else {
        return false;
    };

    for entry in entries.flatten() {
        let Ok(target) = fs::read_link(entry.path()) else {
            continue;
        };

        if socket_target_matches(&target, socket_inodes) {
            return true;
        }
    }

    false
}

fn socket_target_matches(path: &Path, socket_inodes: &HashSet<String>) -> bool {
    let Some(target) = path.to_str() else {
        return false;
    };

    let Some(inode) = target.strip_prefix("socket:[").and_then(|value| value.strip_suffix(']')) else {
        return false;
    };

    socket_inodes.contains(inode)
}
