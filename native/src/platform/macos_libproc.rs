use crate::core::{PortProcess, ProcessProtocol, Protocol};
use std::ffi::{c_void, CStr};
use std::mem::{size_of, MaybeUninit};
use std::os::raw::c_char;

const PROC_ALL_PIDS: u32 = 1;
const PROC_PIDLISTFDS: i32 = 1;
const PROC_PIDFDSOCKETINFO: i32 = 3;
const PROX_FDTYPE_SOCKET: u32 = 2;
const SOCKINFO_IN: i32 = 1;
const SOCKINFO_TCP: i32 = 2;
const TSI_S_LISTEN: i32 = 1;
const IPPROTO_TCP: i32 = 6;
const IPPROTO_UDP: i32 = 17;

#[repr(C)]
#[derive(Clone, Copy)]
struct ProcFdInfo {
    proc_fd: i32,
    proc_fdtype: u32,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct ProcFileInfo {
    fi_openflags: u32,
    fi_status: u32,
    fi_offset: i64,
    fi_type: i32,
    fi_guardflags: u32,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct VinfoStat {
    vst_dev: u32,
    vst_mode: u16,
    vst_nlink: u16,
    vst_ino: u64,
    vst_uid: u32,
    vst_gid: u32,
    vst_atime: i64,
    vst_atimensec: i64,
    vst_mtime: i64,
    vst_mtimensec: i64,
    vst_ctime: i64,
    vst_ctimensec: i64,
    vst_birthtime: i64,
    vst_birthtimensec: i64,
    vst_size: i64,
    vst_blocks: i64,
    vst_blksize: i32,
    vst_flags: u32,
    vst_gen: u32,
    vst_rdev: u32,
    vst_qspare: [i64; 2],
}

#[repr(C)]
#[derive(Clone, Copy)]
struct SockbufInfo {
    sbi_cc: u32,
    sbi_hiwat: u32,
    sbi_mbcnt: u32,
    sbi_mbmax: u32,
    sbi_lowat: u32,
    sbi_flags: i16,
    sbi_timeo: i16,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct InSockinfo {
    insi_fport: i32,
    insi_lport: i32,
    insi_gencnt: u64,
    insi_flags: u32,
    insi_flow: u32,
    insi_vflag: u8,
    insi_ip_ttl: u8,
    padding_before_rfu: [u8; 2],
    rfu_1: u32,
    remaining: [u8; 48],
}

#[repr(C)]
#[derive(Clone, Copy)]
struct TcpSockinfo {
    tcpsi_ini: InSockinfo,
    tcpsi_state: i32,
    tcpsi_timer: [i32; 4],
    tcpsi_mss: i32,
    tcpsi_flags: u32,
    rfu_1: u32,
    tcpsi_tp: u64,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct SocketInfo {
    soi_stat: VinfoStat,
    soi_so: u64,
    soi_pcb: u64,
    soi_type: i32,
    soi_protocol: i32,
    soi_family: i32,
    soi_options: i16,
    soi_linger: i16,
    soi_state: i16,
    soi_qlen: i16,
    soi_incqlen: i16,
    soi_qlimit: i16,
    soi_timeo: i16,
    soi_error: u16,
    soi_oobmark: u32,
    soi_rcv: SockbufInfo,
    soi_snd: SockbufInfo,
    soi_kind: i32,
    rfu_1: u32,
    soi_proto: [u8; 528],
}

#[repr(C)]
#[derive(Clone, Copy)]
struct SocketFdInfo {
    pfi: ProcFileInfo,
    psi: SocketInfo,
}

extern "C" {
    fn proc_listpids(type_: u32, typeinfo: u32, buffer: *mut c_void, buffersize: i32) -> i32;
    fn proc_pidinfo(pid: i32, flavor: i32, arg: u64, buffer: *mut c_void, buffersize: i32) -> i32;
    fn proc_pidfdinfo(pid: i32, fd: i32, flavor: i32, buffer: *mut c_void, buffersize: i32) -> i32;
    fn proc_name(pid: i32, buffer: *mut c_void, buffersize: u32) -> i32;
    fn proc_pidpath(pid: i32, buffer: *mut c_void, buffersize: u32) -> i32;
}

pub fn find_port_processes(port: u16, protocol: Protocol) -> Result<Vec<PortProcess>, String> {
    validate_layout();

    let pids = list_pids();
    let mut matches = Vec::new();

    for pid in pids {
        if pid == 0 || pid == std::process::id() {
            continue;
        }

        matches.extend(pid_port_processes(pid, port, protocol));
    }

    Ok(matches)
}

fn validate_layout() {
    debug_assert_eq!(size_of::<ProcFdInfo>(), 8);
    debug_assert_eq!(size_of::<ProcFileInfo>(), 24);
    debug_assert_eq!(size_of::<VinfoStat>(), 136);
    debug_assert_eq!(size_of::<SockbufInfo>(), 24);
    debug_assert_eq!(size_of::<InSockinfo>(), 80);
    debug_assert_eq!(size_of::<TcpSockinfo>(), 120);
    debug_assert_eq!(size_of::<SocketInfo>(), 768);
    debug_assert_eq!(size_of::<SocketFdInfo>(), 792);
}

fn list_pids() -> Vec<u32> {
    let mut capacity = 4096usize;

    loop {
        let mut pids = vec![0i32; capacity];
        let bytes = unsafe {
            proc_listpids(
                PROC_ALL_PIDS,
                0,
                pids.as_mut_ptr().cast::<c_void>(),
                (pids.len() * size_of::<i32>()) as i32,
            )
        };

        if bytes <= 0 {
            return Vec::new();
        }

        let count = bytes as usize / size_of::<i32>();
        if count < capacity {
            pids.truncate(count);
            return pids
                .into_iter()
                .filter_map(|pid| u32::try_from(pid).ok())
                .filter(|pid| *pid > 0)
                .collect();
        }

        capacity *= 2;
    }
}

fn pid_port_processes(pid: u32, port: u16, protocol: Protocol) -> Vec<PortProcess> {
    let fds = list_fds(pid);
    let mut protocols = Vec::new();

    for fd in fds {
        if fd.proc_fdtype != PROX_FDTYPE_SOCKET {
            continue;
        }

        if let Some(socket) = socket_fdinfo(pid, fd.proc_fd) {
            if let Some(process_protocol) = socket_match_protocol(&socket.psi, port, protocol) {
                protocols.push(process_protocol);
            }
        }
    }

    if protocols.is_empty() {
        return Vec::new();
    }

    let (command, path) = process_metadata(pid);
    protocols
        .into_iter()
        .map(|process_protocol| {
            PortProcess::new(pid, port, process_protocol)
                .with_metadata(command.clone(), path.clone())
        })
        .collect()
}

fn list_fds(pid: u32) -> Vec<ProcFdInfo> {
    let bytes = unsafe { proc_pidinfo(pid as i32, PROC_PIDLISTFDS, 0, std::ptr::null_mut(), 0) };
    if bytes <= 0 {
        return Vec::new();
    }

    let count = bytes as usize / size_of::<ProcFdInfo>();
    if count == 0 {
        return Vec::new();
    }

    let mut fds = vec![
        ProcFdInfo {
            proc_fd: 0,
            proc_fdtype: 0
        };
        count
    ];
    let bytes = unsafe {
        proc_pidinfo(
            pid as i32,
            PROC_PIDLISTFDS,
            0,
            fds.as_mut_ptr().cast::<c_void>(),
            (fds.len() * size_of::<ProcFdInfo>()) as i32,
        )
    };

    if bytes <= 0 {
        return Vec::new();
    }

    let count = bytes as usize / size_of::<ProcFdInfo>();
    fds.truncate(count.min(fds.len()));
    fds
}

fn socket_fdinfo(pid: u32, fd: i32) -> Option<SocketFdInfo> {
    let mut info = MaybeUninit::<SocketFdInfo>::zeroed();
    let bytes = unsafe {
        proc_pidfdinfo(
            pid as i32,
            fd,
            PROC_PIDFDSOCKETINFO,
            info.as_mut_ptr().cast::<c_void>(),
            size_of::<SocketFdInfo>() as i32,
        )
    };

    if bytes as usize == size_of::<SocketFdInfo>() {
        Some(unsafe { info.assume_init() })
    } else {
        None
    }
}

fn socket_match_protocol(
    socket: &SocketInfo,
    port: u16,
    protocol: Protocol,
) -> Option<ProcessProtocol> {
    match protocol {
        Protocol::Tcp => tcp_socket_matches(socket, port).then_some(ProcessProtocol::Tcp),
        Protocol::Udp => udp_socket_matches(socket, port).then_some(ProcessProtocol::Udp),
        Protocol::All => {
            if tcp_socket_matches(socket, port) {
                Some(ProcessProtocol::Tcp)
            } else if udp_socket_matches(socket, port) {
                Some(ProcessProtocol::Udp)
            } else {
                None
            }
        }
    }
}

fn tcp_socket_matches(socket: &SocketInfo, port: u16) -> bool {
    if socket.soi_kind != SOCKINFO_TCP && socket.soi_protocol != IPPROTO_TCP {
        return false;
    }

    let tcp = unsafe { &*(socket.soi_proto.as_ptr().cast::<TcpSockinfo>()) };
    tcp.tcpsi_state == TSI_S_LISTEN && port_matches(tcp.tcpsi_ini.insi_lport, port)
}

fn udp_socket_matches(socket: &SocketInfo, port: u16) -> bool {
    if socket.soi_protocol != IPPROTO_UDP && socket.soi_kind != SOCKINFO_IN {
        return false;
    }

    let inet = unsafe { &*(socket.soi_proto.as_ptr().cast::<InSockinfo>()) };
    port_matches(inet.insi_lport, port)
}

fn port_matches(raw_port: i32, expected: u16) -> bool {
    let raw = raw_port as u16;
    raw == expected || u16::from_be(raw) == expected
}

fn process_metadata(pid: u32) -> (Option<String>, Option<String>) {
    (process_command(pid), process_path(pid))
}

fn process_command(pid: u32) -> Option<String> {
    let mut buffer = [0 as c_char; 1024];
    let bytes = unsafe {
        proc_name(
            pid as i32,
            buffer.as_mut_ptr().cast::<c_void>(),
            buffer.len() as u32,
        )
    };

    if bytes <= 0 {
        return None;
    }

    c_string_from_buffer(&buffer)
}

fn process_path(pid: u32) -> Option<String> {
    let mut buffer = [0 as c_char; 4096];
    let bytes = unsafe {
        proc_pidpath(
            pid as i32,
            buffer.as_mut_ptr().cast::<c_void>(),
            buffer.len() as u32,
        )
    };

    if bytes <= 0 {
        return None;
    }

    c_string_from_buffer(&buffer)
}

fn c_string_from_buffer(buffer: &[c_char]) -> Option<String> {
    let value = unsafe { CStr::from_ptr(buffer.as_ptr()) }
        .to_string_lossy()
        .trim()
        .to_string();

    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}
