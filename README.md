# kill-port-now

Tiny, zero-dependency `kill-port` replacement optimized for dev-server cleanup.

`kill-port@2.0.1` scans every open socket with `lsof -i -P`, then shells out again through `lsof | grep | awk | xargs kill -9`. `kill-port-now` does one targeted lookup and kills PIDs directly from Node.

```sh
npm i -g kill-port-now

kp 3000
kill-port-now 3000 5173
kill-port-now --port 3000,3001 --protocol all
```

## Why it is faster

- One targeted `lsof`: `lsof -nP -t -iTCP:<port> -sTCP:LISTEN`
- No shell pipeline
- No dependencies
- Kills with `process.kill()`
- Avoids DNS and service-name lookups with `-nP`

Local no-listener benchmark on macOS, port `65535`, 3 iterations:

```txt
kill-port lookup path        mean 8859.53 ms
kill-port-now lookup         mean   42.01 ms
Approx speedup: 210.9x
```

Run it yourself:

```sh
npm run bench
```

## CLI

```sh
kp 3000
kill-port-now 3000
kill-port-now 3000 5173
kill-port-now --port 3000,3001
```

Options:

```txt
-p, --port <ports>       Ports to kill, comma-separated or repeated
-m, --method <protocol>  Compatibility alias for --protocol
    --protocol <value>   tcp, udp, or all (default: tcp)
-s, --signal <signal>    Signal to send (default: SIGKILL)
    --dry-run            Print what would be killed without sending a signal
    --strict             Exit 1 when no matching process is found
-q, --quiet              No success output
-v, --verbose            Print matched PIDs
```

By default, an already-free port is not an error. Use `--strict` if scripts should fail when nothing was killed.

## API

```js
const killPort = require('kill-port-now')

await killPort(3000)

const results = await killPort.killPorts([3000, 5173], {
  protocol: 'all',
  signal: 'SIGKILL'
})

console.log(results)
```

Result shape:

```js
{
  port: 3000,
  protocol: 'tcp',
  pids: [12345],
  killed: [12345],
  failed: []
}
```

## Compatibility

- Node.js 18+
- macOS and Linux with `lsof` available
- CLI accepts `--method tcp|udp` for `kill-port` compatibility

## License

MIT
