use std::net::{Ipv4Addr, Ipv6Addr, SocketAddrV4, SocketAddrV6, TcpListener};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PortStatus {
    Free,
    InUse,
    PermissionDenied,
}

pub fn tcp_port_status(port: u16) -> PortStatus {
    match TcpListener::bind(SocketAddrV4::new(Ipv4Addr::UNSPECIFIED, port)) {
        Ok(listener) => {
            drop(listener);
            match TcpListener::bind(SocketAddrV6::new(Ipv6Addr::UNSPECIFIED, port, 0, 0)) {
                Ok(listener) => {
                    drop(listener);
                    PortStatus::Free
                }
                Err(error) if error.kind() == std::io::ErrorKind::AddrInUse => PortStatus::InUse,
                Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => {
                    PortStatus::PermissionDenied
                }
                Err(_) => PortStatus::InUse,
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::AddrInUse => PortStatus::InUse,
        Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => {
            PortStatus::PermissionDenied
        }
        Err(_) => PortStatus::InUse,
    }
}
