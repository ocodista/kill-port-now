use super::protocol::ProcessProtocol;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PortProcess {
    pub pid: u32,
    pub port: u16,
    pub protocol: ProcessProtocol,
    pub command: Option<String>,
    pub path: Option<String>,
}

impl PortProcess {
    pub fn new(pid: u32, port: u16, protocol: ProcessProtocol) -> Self {
        Self {
            pid,
            port,
            protocol,
            command: None,
            path: None,
        }
    }

    pub fn with_metadata(mut self, command: Option<String>, path: Option<String>) -> Self {
        self.command = command;
        self.path = path;
        self
    }
}

pub fn dedupe_processes(processes: &mut Vec<PortProcess>) {
    processes.sort_by(|left, right| {
        (left.pid, left.port, left.protocol).cmp(&(right.pid, right.port, right.protocol))
    });
    processes.dedup_by(|left, right| {
        left.pid == right.pid && left.port == right.port && left.protocol == right.protocol
    });
}

pub fn dedupe_pids(processes: &[PortProcess]) -> Vec<u32> {
    let mut pids = processes
        .iter()
        .map(|process| process.pid)
        .collect::<Vec<_>>();
    pids.sort_unstable();
    pids.dedup();
    pids
}
