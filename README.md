![kill-port-now logo](https://raw.githubusercontent.com/ocodista/kill-port-now/main/logo.png)

# kill-port-now

Kill the process listening on a port in milliseconds.

`kill-port-now` is an API-compatible replacement for [`kill-port`](https://www.npmjs.com/package/kill-port). It keeps the familiar Node API, adds a short `kp` CLI, and uses a native Rust binary when available with a dependency-free Node fallback.

## Install

```sh
npm i -g kill-port-now
```

Node.js 18+ is required for the package API.

The package does not run `preinstall`, `install`, or `postinstall` scripts. The `kp` wrapper selects the bundled native binary at runtime and falls back to Node when needed.

## CLI

```sh
kp 3000
kp 3000 5173
kp --port 3000,3001 --protocol all
kp --dry-run --verbose 3000
```

TCP is the default protocol. Use `--protocol udp` for UDP sockets or `--protocol all` to check both. Run `kp --help` for every option.

## Node API

```js
const kill = require('kill-port-now')

await kill(3000)
await kill(3000, 'tcp')
await kill(3000, 'udp')
await kill(3000, { protocol: 'all', signal: 'SIGTERM' })
```

## Benchmark

Watch `kill-port-now` recover a dev server while `kill-port` kills the wrong one:

![Side-by-side terminal comparison of kill-port and kill-port-now](./docs/assets/diff-demo.gif)

[Download the MP4](./docs/assets/diff-demo.mp4).

Local macOS benchmark, 3 iterations. Lower latency is better.

| Operation | `kill-port` | `kill-port-now` | Faster |
| --- | ---: | ---: | ---: |
| Empty port | `11032.29 ms` | `3.02 ms` | `3,653x` |
| UDP kill | `10219.75 ms` | `3.25 ms` | `3,140x` |
| TCP kill | `10311.02 ms` | `3.24 ms` | `3,185x` |

```mermaid
xychart-beta
    title "Speedup over kill-port"
    x-axis ["Empty port", "UDP kill", "TCP kill"]
    y-axis "Faster (x)" 0 --> 4000
    bar [3653, 3140, 3185]
```

```sh
npm run bench:native
open benchmarks/index.html
```

## Development

See [docs/development.md](docs/development.md) for architecture, benchmarks, native prebuilds, fallback paths, and release steps.

## License

MIT
