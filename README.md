# kill-port-now

Tiny, zero-dependency `kill-port` replacement optimized for dev-server cleanup.

`kill-port@2.0.1` scans every open socket, then runs `lsof | grep | awk | xargs kill -9`. `kill-port-now` does one targeted `lsof` lookup and kills PIDs directly from Node.

## Install

```sh
npm i -g kill-port-now
```

## Use

```sh
kp 3000
kill-port-now 3000 5173
kill-port-now --port 3000,3001 --protocol all
```

## Benchmark

Local no-listener benchmark on macOS, port `65535`, 3 iterations.

| Tool | Mean lookup time | Chart | Speed |
| --- | ---: | --- | ---: |
| `kill-port` lookup path | `8859.53 ms` | `████████████████████████████████████████` | `1x` |
| `kill-port-now` lookup | `42.01 ms` | `▏` | `210.9x faster` |

```sh
npm run bench
```

## Why it is faster

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
await killPort.killPorts([3000, 5173], { protocol: 'all' })
```

## Compatibility

Node.js 18+. macOS and Linux with `lsof`.

## License

MIT
