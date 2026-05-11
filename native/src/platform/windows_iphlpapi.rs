use crate::core::{PortProcess, ProcessProtocol, Protocol};
use std::ffi::c_void;
use std::mem::size_of;

const AF_INET: u32 = 2;
const AF_INET6: u32 = 23;
const ERROR_INSUFFICIENT_BUFFER: u32 = 122;
const NO_ERROR: u32 = 0;
const MIB_TCP_STATE_LISTEN: u32 = 2;
const TCP_TABLE_OWNER_PID_ALL: u32 = 5;
const UDP_TABLE_OWNER_PID: u32 = 1;

#[repr(C)]
#[derive(Clone, Copy)]
struct MibTcpRowOwnerPid {
    state: u32,
    local_addr: u32,
    local_port: u32,
    remote_addr: u32,
    remote_port: u32,
    owning_pid: u32,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct MibTcp6RowOwnerPid {
    local_addr: [u8; 16],
    local_scope_id: u32,
    local_port: u32,
    remote_addr: [u8; 16],
    remote_scope_id: u32,
    remote_port: u32,
    state: u32,
    owning_pid: u32,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct MibUdpRowOwnerPid {
    local_addr: u32,
    local_port: u32,
    owning_pid: u32,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct MibUdp6RowOwnerPid {
    local_addr: [u8; 16],
    local_scope_id: u32,
    local_port: u32,
    owning_pid: u32,
}

#[link(name = "iphlpapi")]
extern "system" {
    fn GetExtendedTcpTable(
        tcp_table: *mut c_void,
        size_pointer: *mut u32,
        order: i32,
        family: u32,
        table_class: u32,
        reserved: u32,
    ) -> u32;
    fn GetExtendedUdpTable(
        udp_table: *mut c_void,
        size_pointer: *mut u32,
        order: i32,
        family: u32,
        table_class: u32,
        reserved: u32,
    ) -> u32;
}

pub fn find_port_processes(port: u16, protocol: Protocol) -> Result<Vec<PortProcess>, String> {
    let mut processes = Vec::new();

    if matches!(protocol, Protocol::Tcp | Protocol::All) {
        collect_tcp4(port, &mut processes)?;
        collect_tcp6(port, &mut processes)?;
    }

    if matches!(protocol, Protocol::Udp | Protocol::All) {
        collect_udp4(port, &mut processes)?;
        collect_udp6(port, &mut processes)?;
    }

    Ok(processes)
}

fn collect_tcp4(port: u16, processes: &mut Vec<PortProcess>) -> Result<(), String> {
    let buffer = tcp_table(AF_INET)?;
    for row in table_rows::<MibTcpRowOwnerPid>(&buffer) {
        if row.state == MIB_TCP_STATE_LISTEN && port_matches(row.local_port, port) {
            processes.push(PortProcess::new(row.owning_pid, port, ProcessProtocol::Tcp));
        }
    }
    Ok(())
}

fn collect_tcp6(port: u16, processes: &mut Vec<PortProcess>) -> Result<(), String> {
    let buffer = tcp_table(AF_INET6)?;
    for row in table_rows::<MibTcp6RowOwnerPid>(&buffer) {
        if row.state == MIB_TCP_STATE_LISTEN && port_matches(row.local_port, port) {
            processes.push(PortProcess::new(row.owning_pid, port, ProcessProtocol::Tcp));
        }
    }
    Ok(())
}

fn collect_udp4(port: u16, processes: &mut Vec<PortProcess>) -> Result<(), String> {
    let buffer = udp_table(AF_INET)?;
    for row in table_rows::<MibUdpRowOwnerPid>(&buffer) {
        if port_matches(row.local_port, port) {
            processes.push(PortProcess::new(row.owning_pid, port, ProcessProtocol::Udp));
        }
    }
    Ok(())
}

fn collect_udp6(port: u16, processes: &mut Vec<PortProcess>) -> Result<(), String> {
    let buffer = udp_table(AF_INET6)?;
    for row in table_rows::<MibUdp6RowOwnerPid>(&buffer) {
        if port_matches(row.local_port, port) {
            processes.push(PortProcess::new(row.owning_pid, port, ProcessProtocol::Udp));
        }
    }
    Ok(())
}

fn tcp_table(family: u32) -> Result<Vec<u8>, String> {
    query_table(|buffer, size| unsafe {
        GetExtendedTcpTable(buffer, size, 0, family, TCP_TABLE_OWNER_PID_ALL, 0)
    })
}

fn udp_table(family: u32) -> Result<Vec<u8>, String> {
    query_table(|buffer, size| unsafe {
        GetExtendedUdpTable(buffer, size, 0, family, UDP_TABLE_OWNER_PID, 0)
    })
}

fn query_table(query: impl Fn(*mut c_void, *mut u32) -> u32) -> Result<Vec<u8>, String> {
    let mut size = 0u32;
    let first_result = query(std::ptr::null_mut(), &mut size);
    if first_result != ERROR_INSUFFICIENT_BUFFER && first_result != NO_ERROR {
        return Err(format!("iphlpapi lookup failed: {first_result}"));
    }

    if size == 0 {
        return Ok(Vec::new());
    }

    let mut buffer = vec![0u8; size as usize];
    let result = query(buffer.as_mut_ptr().cast::<c_void>(), &mut size);
    if result != NO_ERROR {
        return Err(format!("iphlpapi lookup failed: {result}"));
    }

    Ok(buffer)
}

fn table_rows<T: Copy>(buffer: &[u8]) -> Vec<T> {
    if buffer.len() < size_of::<u32>() {
        return Vec::new();
    }

    let count = unsafe { std::ptr::read_unaligned(buffer.as_ptr().cast::<u32>()) } as usize;
    let mut rows = Vec::new();
    let mut offset = size_of::<u32>();

    for _ in 0..count {
        if offset + size_of::<T>() > buffer.len() {
            break;
        }

        let row = unsafe { std::ptr::read_unaligned(buffer.as_ptr().add(offset).cast::<T>()) };
        rows.push(row);
        offset += size_of::<T>();
    }

    rows
}

fn port_matches(raw_port: u32, expected: u16) -> bool {
    let port = (raw_port & 0xffff) as u16;
    port == expected || u16::from_be(port) == expected
}
