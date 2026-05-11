use kill_port_now_native::{
    find_port_processes, is_missing_process_error, kill_pid, parse_ports, pid_exists, signal_label,
    signal_number, PortProcess, Protocol, SIGKILL_NUMBER, SIGTERM_NUMBER,
};
use std::time::{Duration, Instant};

const DEFAULT_GRACEFUL_TIMEOUT_MS: u64 = 500;

struct Options {
    ports: Vec<String>,
    protocol: Protocol,
    signal: i32,
    dry_run: bool,
    force: bool,
    graceful: bool,
    graceful_timeout_ms: u64,
    json: bool,
    quiet: bool,
    strict: bool,
}

struct Failure {
    pid: u32,
    code: String,
    message: String,
}

struct KillOutcome {
    killed: Vec<u32>,
    failed: Vec<Failure>,
}

struct PortResult {
    port: u16,
    protocol: Protocol,
    processes: Vec<PortProcess>,
    pids: Vec<u32>,
    killed: Vec<u32>,
    failed: Vec<Failure>,
    dry_run: bool,
    signal: String,
    graceful: bool,
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
    let mut results = Vec::new();

    for port in ports {
        let processes = match find_port_processes(port, options.protocol) {
            Ok(processes) => processes,
            Err(message) => {
                eprintln!("port {port}: {message}");
                had_error = true;
                continue;
            }
        };

        let pids = unique_pids(&processes);
        let outcome = kill_processes(&pids, &options);
        killed_any = killed_any || !outcome.killed.is_empty();
        had_error = had_error || !outcome.failed.is_empty();

        let result = PortResult {
            port,
            protocol: options.protocol,
            processes,
            pids,
            killed: outcome.killed,
            failed: outcome.failed,
            dry_run: options.dry_run,
            signal: if options.graceful {
                signal_label(SIGTERM_NUMBER)
            } else {
                signal_label(options.signal)
            },
            graceful: options.graceful,
        };

        if !options.json {
            print_text_result(&result, &options);
        }

        results.push(result);
    }

    if options.json {
        println!("{}", json_results(&results));
    }

    if had_error || (options.strict && !killed_any) {
        std::process::exit(1);
    }
}

fn parse_args(args: Vec<String>) -> Result<Options, String> {
    let mut ports = Vec::new();
    let mut protocol = Protocol::All;
    let mut signal = SIGKILL_NUMBER;
    let mut dry_run = false;
    let mut force = false;
    let mut graceful = false;
    let mut graceful_timeout_ms = DEFAULT_GRACEFUL_TIMEOUT_MS;
    let mut json = false;
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
            "-s" | "--signal" => {
                index += 1;
                signal = signal_number(&take_value(&args, index, arg)?)?;
            }
            "--tcp-only" => protocol = set_protocol(protocol, Protocol::Tcp, arg)?,
            "--udp-only" => protocol = set_protocol(protocol, Protocol::Udp, arg)?,
            "--dry-run" => dry_run = true,
            "--force" => force = true,
            "--graceful" => graceful = true,
            "--graceful-timeout" | "--graceful-timeout-ms" => {
                index += 1;
                graceful_timeout_ms = parse_timeout(&take_value(&args, index, arg)?)?;
            }
            "--json" => json = true,
            "--strict" => strict = true,
            "-q" | "--quiet" | "--silent" => quiet = true,
            value if value.starts_with("--port=") => {
                ports.push(value.trim_start_matches("--port=").to_string());
            }
            value if value.starts_with("--signal=") => {
                signal = signal_number(value.trim_start_matches("--signal="))?;
            }
            value if value.starts_with("--graceful-timeout=") => {
                graceful_timeout_ms =
                    parse_timeout(value.trim_start_matches("--graceful-timeout="))?;
            }
            value if value.starts_with("--graceful-timeout-ms=") => {
                graceful_timeout_ms =
                    parse_timeout(value.trim_start_matches("--graceful-timeout-ms="))?;
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
        force,
        graceful,
        graceful_timeout_ms,
        json,
        quiet,
        strict,
    })
}

fn set_protocol(current: Protocol, next: Protocol, flag: &str) -> Result<Protocol, String> {
    if current != Protocol::All && current != next {
        return Err(format!(
            "{flag} cannot be combined with another protocol filter"
        ));
    }

    Ok(next)
}

fn take_value(args: &[String], index: usize, flag: &str) -> Result<String, String> {
    args.get(index)
        .filter(|value| !value.starts_with('-'))
        .cloned()
        .ok_or_else(|| format!("{flag} requires a value"))
}

fn parse_timeout(value: &str) -> Result<u64, String> {
    let timeout = value
        .trim()
        .parse::<u64>()
        .map_err(|_| format!("invalid graceful timeout: {value}"))?;

    if timeout == 0 {
        return Err("graceful timeout must be greater than 0".to_string());
    }

    Ok(timeout)
}

fn unique_pids(processes: &[PortProcess]) -> Vec<u32> {
    let mut pids = processes
        .iter()
        .map(|process| process.pid)
        .collect::<Vec<_>>();
    pids.sort_unstable();
    pids.dedup();
    pids
}

fn kill_processes(pids: &[u32], options: &Options) -> KillOutcome {
    if options.dry_run {
        return KillOutcome {
            killed: pids.to_vec(),
            failed: Vec::new(),
        };
    }

    if options.graceful {
        return kill_processes_gracefully(pids, options.graceful_timeout_ms);
    }

    let _forceful = options.force;
    let mut killed = Vec::new();
    let mut failed = Vec::new();

    for pid in pids {
        match kill_pid(*pid, options.signal) {
            Ok(()) => killed.push(*pid),
            Err(message) if is_missing_process_error(&message) => {}
            Err(message) => failed.push(Failure {
                pid: *pid,
                code: "ERR_KILL_FAILED".to_string(),
                message,
            }),
        }
    }

    KillOutcome { killed, failed }
}

fn kill_processes_gracefully(pids: &[u32], timeout_ms: u64) -> KillOutcome {
    let mut term_sent = Vec::new();
    let mut killed = Vec::new();
    let mut failed = Vec::new();

    for pid in pids {
        match kill_pid(*pid, SIGTERM_NUMBER) {
            Ok(()) => term_sent.push(*pid),
            Err(message) if is_missing_process_error(&message) => {}
            Err(message) => failed.push(Failure {
                pid: *pid,
                code: "ERR_KILL_FAILED".to_string(),
                message,
            }),
        }
    }

    let remaining = wait_for_exit(&term_sent, timeout_ms);
    let remaining_set = remaining
        .iter()
        .copied()
        .collect::<std::collections::HashSet<_>>();
    killed.extend(
        term_sent
            .iter()
            .copied()
            .filter(|pid| !remaining_set.contains(pid)),
    );

    for pid in remaining {
        match kill_pid(pid, SIGKILL_NUMBER) {
            Ok(()) => killed.push(pid),
            Err(message) if is_missing_process_error(&message) => killed.push(pid),
            Err(message) => failed.push(Failure {
                pid,
                code: "ERR_KILL_FAILED".to_string(),
                message,
            }),
        }
    }

    killed.sort_unstable();
    killed.dedup();

    KillOutcome { killed, failed }
}

fn wait_for_exit(pids: &[u32], timeout_ms: u64) -> Vec<u32> {
    let deadline = Instant::now() + Duration::from_millis(timeout_ms);
    let mut remaining = pids.to_vec();

    while !remaining.is_empty() && Instant::now() < deadline {
        remaining.retain(|pid| pid_exists(*pid));
        if remaining.is_empty() {
            break;
        }
        std::thread::sleep(Duration::from_millis(25));
    }

    remaining.retain(|pid| pid_exists(*pid));
    remaining
}

fn print_text_result(result: &PortResult, options: &Options) {
    if options.quiet {
        return;
    }

    if result.pids.is_empty() {
        println!("port {} is already free", result.port);
        return;
    }

    for failure in &result.failed {
        eprintln!(
            "failed to kill {} on port {}: {}",
            failure.pid, result.port, failure.message
        );
    }

    if !result.killed.is_empty() {
        let action = if result.dry_run {
            "would kill"
        } else {
            "killed"
        };
        println!(
            "{action} {} on port {}",
            join_pids(&result.killed),
            result.port
        );
    }
}

fn join_pids(pids: &[u32]) -> String {
    pids.iter()
        .map(|pid| pid.to_string())
        .collect::<Vec<_>>()
        .join(", ")
}

fn json_results(results: &[PortResult]) -> String {
    format!(
        "{{\"results\":[{}]}}",
        results
            .iter()
            .map(json_result)
            .collect::<Vec<_>>()
            .join(",")
    )
}

fn json_result(result: &PortResult) -> String {
    format!(
        "{{\"port\":{},\"protocol\":{},\"processes\":[{}],\"pids\":[{}],\"killed\":[{}],\"failed\":[{}],\"dryRun\":{},\"signal\":{},\"graceful\":{}}}",
        result.port,
        json_string(result.protocol.as_str()),
        result
            .processes
            .iter()
            .map(json_process)
            .collect::<Vec<_>>()
            .join(","),
        json_u32_array(&result.pids),
        json_u32_array(&result.killed),
        result
            .failed
            .iter()
            .map(json_failure)
            .collect::<Vec<_>>()
            .join(","),
        result.dry_run,
        json_string(&result.signal),
        result.graceful,
    )
}

fn json_process(process: &PortProcess) -> String {
    let mut fields = vec![
        format!("\"pid\":{}", process.pid),
        format!("\"port\":{}", process.port),
        format!("\"protocol\":{}", json_string(process.protocol.as_str())),
    ];

    if let Some(command) = &process.command {
        fields.push(format!("\"command\":{}", json_string(command)));
    }

    if let Some(path) = &process.path {
        fields.push(format!("\"path\":{}", json_string(path)));
    }

    format!("{{{}}}", fields.join(","))
}

fn json_failure(failure: &Failure) -> String {
    format!(
        "{{\"pid\":{},\"code\":{},\"message\":{}}}",
        failure.pid,
        json_string(&failure.code),
        json_string(&failure.message),
    )
}

fn json_u32_array(values: &[u32]) -> String {
    values
        .iter()
        .map(|value| value.to_string())
        .collect::<Vec<_>>()
        .join(",")
}

fn json_string(value: &str) -> String {
    let mut escaped = String::from("\"");
    for character in value.chars() {
        match character {
            '\"' => escaped.push_str("\\\""),
            '\\' => escaped.push_str("\\\\"),
            '\n' => escaped.push_str("\\n"),
            '\r' => escaped.push_str("\\r"),
            '\t' => escaped.push_str("\\t"),
            character if character.is_control() => {
                escaped.push_str(&format!("\\u{:04x}", character as u32));
            }
            character => escaped.push(character),
        }
    }
    escaped.push('\"');
    escaped
}

fn print_help() {
    println!(
        "kp-rs: free a local port by killing matching processes\n\nUsage:\n  kp-rs <port...>\n  kp-rs --port 3000,3001\n\nOptions:\n  -p, --port <ports>              Comma-separated or repeated ports\n      --tcp-only                  Only match TCP listeners\n      --udp-only                  Only match UDP sockets\n  -s, --signal <signal>           Signal to send (default: SIGKILL)\n      --dry-run                   Print matches without killing\n      --force                     Explicit alias for default forceful behavior\n      --graceful                  Send SIGTERM, wait, then SIGKILL survivors\n      --graceful-timeout <ms>     Graceful wait before SIGKILL (default: 500)\n      --json                      Print machine-readable results\n      --strict                    Exit 1 when nothing was killed\n  -q, --quiet                     No success output"
    );
}
