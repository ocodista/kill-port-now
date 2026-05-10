use kill_port_now_native::parse_port;
use kill_port_now_native::ports::{tcp_port_status, PortStatus};

fn main() {
    let mut args = std::env::args().skip(1);
    let Some(port_arg) = args.next() else {
        eprintln!("usage: fp-rs <port>");
        std::process::exit(2);
    };

    let port = match parse_port(&port_arg) {
        Ok(port) => port,
        Err(message) => {
            eprintln!("{message}");
            std::process::exit(2);
        }
    };

    match tcp_port_status(port) {
        PortStatus::Free => {
            println!("Port is free");
        }
        PortStatus::InUse => {
            println!("Port is in use");
            std::process::exit(1);
        }
        PortStatus::PermissionDenied => {
            println!("Port requires elevated privileges");
            std::process::exit(1);
        }
    }
}
