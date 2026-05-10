# kill-port-now

Tiny, zero-dependency, API-compatible `kill-port` replacement optimized for dev-server cleanup.

Killing one port should not take seconds. `kill-port@2.0.1` scans every open socket, then runs `lsof | grep | awk | xargs kill -9`. `kill-port-now` does one targeted `lsof` lookup and kills PIDs directly from Node.

Use it as a drop-in for documented `kill-port` calls on macOS/Linux: `kill(port)` and `kill(port, 'udp')`. If you inspect the resolved value, `kill-port-now` returns a structured result.

## Install

```sh
npm i -g kill-port-now
```

## Use

```sh
kp 3000
kill-port 3000
kill-port-now 3000 5173
kill-port-now --port 3000,3001 --protocol all
```

## Benchmark

Local macOS benchmark, 3 iterations.

| Operation | `kill-port` | `kill-port-now` JS | `kp-rs` native |
| --- | ---: | ---: | ---: |
| Empty port | `7307.94 ms` | `56.72 ms` | `3.46 ms` |
| TCP kill | `5235.45 ms` | `56.44 ms` | `2.96 ms` |
| UDP kill | `5409.06 ms` | `60.56 ms` | `3.00 ms` |

### Empty port

| Tool | Mean | Chart |
| --- | ---: | --- |
| `kill-port` | `7307.94 ms` | `████████████████████████████████████████` |
| `kill-port-now` JS | `56.72 ms` | `▎` |
| `kp-rs` native | `3.46 ms` | `▏` |

### TCP kill

| Tool | Mean | Chart |
| --- | ---: | --- |
| `kill-port` | `5235.45 ms` | `████████████████████████████████████████` |
| `kill-port-now` JS | `56.44 ms` | `▍` |
| `kp-rs` native | `2.96 ms` | `▏` |

### UDP kill

| Tool | Mean | Chart |
| --- | ---: | --- |
| `kill-port` | `5409.06 ms` | `████████████████████████████████████████` |
| `kill-port-now` JS | `60.56 ms` | `▍` |
| `kp-rs` native | `3.00 ms` | `▏` |

```sh
npm run bench
npm run bench:native
```

## Native prototype

This repo includes no-dependency Rust prototypes:

```sh
cargo build --release --manifest-path native/Cargo.toml
native/target/release/kp-rs 3000
native/target/release/fp-rs 3000
```

`kp-rs` does not call `lsof`. It uses `libproc` on macOS and `/proc` on Linux.

## Why the JS version is faster

- Targeted lookup: `lsof -nP -t -iTCP:<port> -sTCP:LISTEN`
- No shell pipeline
- No dependencies
- Direct `process.kill()` calls

## Options

```txt
-p, --port <ports>       Comma-separated or repeated ports
-m, --method <protocol>  Alias for --protocol
    --protocol <value>   tcp, udp, or all (default: tcp)
-s, --signal <signal>    Signal to send (default: SIGKILL)
    --dry-run            Print matches without killing
    --strict             Exit 1 when nothing was killed
-q, --quiet              No success output
-v, --verbose            Print matched PIDs
```

## API

```js
const killPort = require('kill-port-now')

await killPort(3000)
await killPort(3000, 'udp')
await killPort.killPorts([3000, 5173], { protocol: 'all' })
```

## API compatibility

| Behavior | Status |
| --- | --- |
| `require('kill-port-now')(port)` | API-compatible |
| `kill(port, 'tcp' | 'udp')` | API-compatible |
| Free port rejection | API-compatible |
| `kill-port`, `kill-port-now`, `kp` bins | Supported |
| Success return value | Different: structured result |
| Windows | Not supported |

Node.js 18+. macOS and Linux with `lsof`.

## License

MIT
