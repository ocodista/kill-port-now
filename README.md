# kill-port-now

API-compatible `kill-port` replacement that is thousands of times faster.

`kill-port@2.0.1` has 1M+ weekly downloads, but a single port kill can take ~10 seconds on macOS. `kill-port-now` keeps the documented `kill-port` API and uses a no-dependency Rust CLI by default.

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
fp 3000
```

## How much faster?

Local macOS benchmark, 3 iterations. Lower is better.

| Operation | `kill-port` | `kill-port-now` | Faster |
| --- | ---: | ---: | ---: |
| Empty port | `11032.29 ms` | `3.02 ms` | `3,653x` |
| TCP kill | `10311.02 ms` | `3.24 ms` | `3,182x` |
| UDP kill | `10219.75 ms` | `3.25 ms` | `3,145x` |

```mermaid
xychart-beta
  title "Speedup over kill-port"
  x-axis ["empty", "TCP", "UDP"]
  y-axis "times faster" 0 --> 3800
  bar [3653, 3182, 3145]
```

```mermaid
xychart-beta
  title "Mean latency: kill-port vs kill-port-now"
  x-axis ["kill-port empty", "kill-port-now empty", "kill-port TCP", "kill-port-now TCP", "kill-port UDP", "kill-port-now UDP"]
  y-axis "ms" 0 --> 11200
  bar [11032.29, 3.02, 10311.02, 3.24, 10219.75, 3.25]
```

Full benchmark dashboard:

```sh
open benchmarks/index.html
npm run bench:native
```

## API-compatible with `kill-port`

```js
const kill = require('kill-port-now')

await kill(3000)
await kill(3000, 'tcp')
await kill(3000, 'udp')
```

Compatibility:

| Behavior | Status |
| --- | --- |
| `kill(port)` | Compatible |
| `kill(port, 'tcp')` | Compatible |
| `kill(port, 'udp')` | Compatible |
| Free port rejection | Compatible |
| CLI `kill-port <port>` | Compatible |
| Multiple ports | Compatible |

## Binaries

The package exposes:

- `kill-port`
- `kill-port-now`
- `kp`
- `free-port-now`
- `fp`

`kill-port-now` uses native Rust prebuilds by default where available. Node.js 18+ is required for the package API.

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

## Development

See [docs/development.md](docs/development.md) for architecture, benchmark methodology, fallback paths, native prebuilds, and release steps.

## License

MIT
