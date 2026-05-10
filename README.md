![kill-port-now logo](./logo.png)

# kill-port-now

Kill the process listening on a port in milliseconds.

`kill-port-now` is an API-compatible replacement for [`kill-port`](https://www.npmjs.com/package/kill-port). It exists because `kill-port@2.0.1` can take about 10 seconds to handle one port on macOS. This package keeps the familiar Node API, exposes a short `kp` CLI, and uses a native Rust binary when available with a dependency-free Node fallback.

## Install

```sh
npm i -g kill-port-now
```

Node.js 18+ is required for the package API.

## CLI

```sh
kp 3000
kp 3000 5173
kp --port 3000,3001 --protocol all
kp --dry-run --verbose 3000
```

TCP is the default protocol. Use `--protocol udp` for UDP sockets or `--protocol all` to check both.

### Options

| Option | Description |
| --- | --- |
| `-p, --port ports` | Comma-separated or repeated ports. |
| `-m, --method protocol` | Alias for `--protocol`. |
| `--protocol protocol` | `tcp`, `udp`, or `all`. Defaults to `tcp`. |
| `-s, --signal signal` | Signal to send. Defaults to `SIGKILL`. |
| `--dry-run` | Print matches without killing them. |
| `--strict` | Exit 1 when no process was killed. |
| `-q, --quiet` | Hide success output. |
| `-v, --verbose` | Print matched PIDs. |

## Node API

```js
const kill = require('kill-port-now')

await kill(3000)
await kill(3000, 'tcp')
await kill(3000, 'udp')
await kill(3000, { protocol: 'all', signal: 'SIGTERM' })
```

Compatibility with `kill-port`:

| Behavior | Status |
| --- | --- |
| `kill(port)` | Compatible |
| `kill(port, 'tcp')` | Compatible |
| `kill(port, 'udp')` | Compatible |
| Free port rejection | Compatible |
| Multiple ports | Compatible |

## Benchmark

Local macOS benchmark, 3 iterations. Lower latency is better.

| Operation | `kill-port` | `kill-port-now` | Faster |
| --- | ---: | ---: | ---: |
| Empty port | `11032.29 ms` | `3.02 ms` | `3,653x` |
| UDP kill | `10219.75 ms` | `3.25 ms` | `3,140x` |
| TCP kill | `10311.02 ms` | `3.24 ms` | `3,185x` |

Run the benchmark dashboard locally:

```sh
npm run bench:native
open benchmarks/index.html
```

`kill-port` has 1M+ weekly downloads. Sources: [npm package page](https://www.npmjs.com/package/kill-port) and [npm downloads API](https://api.npmjs.org/downloads/point/last-week/kill-port).

## Development

See [docs/development.md](docs/development.md) for architecture, benchmark methodology, fallback paths, native prebuilds, and release steps.

## License

MIT
