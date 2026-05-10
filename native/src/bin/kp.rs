use kill_port_now_native::{find_pids_by_port, kill_pid, parse_ports, signal_number, Protocol};

struct Options {
    ports: Vec<String>,
    protocol: Protocol,
    signal: i32,
    dry_run: bool,
    quiet: bool,
    strict: bool,
}

fn main() {
    let options = match parse_args(std::env::args().skip(1).collect()) {
        Ok(options) => options,
        Err(message) => {
            eprintln!("{message}");
            std::process::exit(2);
        }
    };

    let ports = match parse_ports(&options.ports) {
        Ok(ports) => ports,
        Err(message) => {
            eprintln!("{message}");
            std::process::exit(2);
        }
    };

    let mut killed_any = false;
    let mut had_error = false;

    for port in ports {
        let pids = match find_pids_by_port(port, options.protocol) {
            Ok(pids) => pids,
            Err(message) => {
                eprintln!("port {port}: {message}");
                had_error = true;
                continue;
            }
        };

        if pids.is_empty() {
            if !options.quiet {
                println!("port {port} is already free");
            }
            continue;
        }

        let mut killed_for_port = Vec::new();
        for pid in pids {
            if options.dry_run {
                killed_for_port.push(pid);
                killed_any = true;
                continue;
            }

            match kill_pid(pid, options.signal) {
                Ok(()) => {
                    killed_for_port.push(pid);
                    killed_any = true;
                }
                Err(message) => {
                    eprintln!("failed to kill {pid} on port {port}: {message}");
                    had_error = true;
                }
            }
        }

        if !options.quiet && !killed_for_port.is_empty() {
            let action = if options.dry_run { "would kill" } else { "killed" };
            println!("{action} {} on port {port}", join_pids(&killed_for_port));
        }
    }

    if had_error || (options.strict && !killed_any) {
        std::process::exit(1);
    }
}

fn parse_args(args: Vec<String>) -> Result<Options, String> {
    let mut ports = Vec::new();
    let mut protocol = Protocol::Tcp;
    let mut signal = 9;
    let mut dry_run = false;
    let mut quiet = false;
    let mut strict = false;

    let mut index = 0usize;
    while index < args.len() {
        let arg = &args[index];

        match arg.as_str() {
            "--" => {
                ports.extend(args[index + 1..].iter().cloned());
                break;
            }
            "-h" | "--help" => {
                print_help();
                std::process::exit(0);
            }
            "-p" | "--port" => {
                index += 1;
                ports.push(take_value(&args, index, arg)?);
            }
            "-m" | "--method" | "--protocol" => {
                index += 1;
                protocol = Protocol::parse(&take_value(&args, index, arg)?)?;
            }
            "-s" | "--signal" => {
                index += 1;
                signal = signal_number(&take_value(&args, index, arg)?)?;
            }
            "--dry-run" => dry_run = true,
            "--strict" => strict = true,
            "-q" | "--quiet" | "--silent" => quiet = true,
            value if value.starts_with("--port=") => {
                ports.push(value.trim_start_matches("--port=").to_string());
            }
            value if value.starts_with("--method=") => {
                protocol = Protocol::parse(value.trim_start_matches("--method="))?;
            }
            value if value.starts_with("--protocol=") => {
                protocol = Protocol::parse(value.trim_start_matches("--protocol="))?;
            }
            value if value.starts_with("--signal=") => {
                signal = signal_number(value.trim_start_matches("--signal="))?;
            }
            value if value.starts_with('-') => return Err(format!("unknown option: {value}")),
            value => ports.push(value.to_string()),
        }

        index += 1;
    }

    Ok(Options {
        ports,
        protocol,
        signal,
        dry_run,
        quiet,
        strict,
    })
}

fn take_value(args: &[String], index: usize, flag: &str) -> Result<String, String> {
    args.get(index)
        .filter(|value| !value.starts_with('-'))
        .cloned()
        .ok_or_else(|| format!("{flag} requires a value"))
}

fn join_pids(pids: &[i32]) -> String {
    pids.iter()
        .map(|pid| pid.to_string())
        .collect::<Vec<_>>()
        .join(", ")
}

fn print_help() {
    println!(
        "kp-rs: kill processes listening on a port\n\nUsage:\n  kp-rs <port...>\n  kp-rs --port 3000,3001\n\nOptions:\n  -p, --port <ports>       Comma-separated or repeated ports\n  -m, --method <protocol>  tcp, udp, or all (default: tcp)\n  -s, --signal <signal>    Signal to send (default: SIGKILL)\n      --dry-run            Print matches without killing\n      --strict             Exit 1 when nothing was killed\n  -q, --quiet              No success output"
    );
}
