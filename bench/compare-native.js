#!/usr/bin/env node
'use strict'

const { execFileSync, fork, spawnSync } = require('node:child_process')
const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const path = require('node:path')

const ITERATIONS = Number(process.env.ITERATIONS || 3)
const ROOT = path.join(__dirname, '..')
const TCP_FIXTURE = path.join(ROOT, 'fixtures', 'server.js')
const UDP_FIXTURE = path.join(ROOT, 'fixtures', 'udp-server.js')
const JS_KP = path.join(ROOT, 'bin', 'kp-js')
const DEFAULT_KP = path.join(ROOT, 'bin', 'kp')
const NATIVE_KP = nativeBinaryPath('kp-rs') || DEFAULT_KP
const RUST_FP = path.join(ROOT, 'native', 'target', 'release', process.platform === 'win32' ? 'fp-rs.exe' : 'fp-rs')
const BENCHMARK_DATA_DIR = path.join(ROOT, 'benchmarks', 'data')

const SCENARIOS = [
  { id: 'empty-port', name: 'Empty port', description: 'No listener exists. Measures no-op/rejection overhead.' },
  { id: 'tcp-kill', name: 'TCP kill', description: 'Kill a temporary TCP listener.' },
  { id: 'udp-kill', name: 'UDP kill', description: 'Kill a temporary UDP socket.' },
  { id: 'tcp-check-free', name: 'TCP free check', description: 'Check an unused TCP port without killing.' },
  { id: 'tcp-check-in-use', name: 'TCP in-use check', description: 'Check a live TCP listener without killing.' }
]

const TOOLS = [
  { id: 'kill-port', name: 'kill-port', usesLsof: true, usesShellPipeline: true, native: false },
  { id: 'kill-port-now-js', name: 'kill-port-now JS', usesLsof: true, usesShellPipeline: false, native: false },
  { id: 'macos-lsof', name: 'macOS lsof', usesLsof: true, usesShellPipeline: false, native: false },
  { id: 'macos-netstat', name: 'macOS netstat', usesLsof: false, usesShellPipeline: false, native: false },
  { id: 'bash-netstat', name: 'bash netstat', usesLsof: false, usesShellPipeline: true, native: false },
  { id: 'kill-port-now-rust', name: 'kill-port-now Rust', usesLsof: false, usesShellPipeline: false, native: true },
  { id: 'bash-dev-tcp', name: 'bash /dev/tcp', usesLsof: false, usesShellPipeline: false, native: false },
  { id: 'fp-rs', name: 'fp-rs', usesLsof: false, usesShellPipeline: false, native: true }
]

function nativeBinaryPath(binaryName) {
  const platformByKey = {
    'darwin:arm64': 'darwin-arm64',
    'darwin:x64': 'darwin-x64',
    'linux:x64': 'linux-x64',
    'linux:arm64': 'linux-arm64'
  }
  const platform = platformByKey[`${process.platform}:${process.arch}`]
  if (!platform) {
    return null
  }

  const binaryPath = path.join(ROOT, 'prebuilds', platform, binaryName)
  return require('node:fs').existsSync(binaryPath) ? binaryPath : null
}

function commandExists(command) {
  const result = spawnSync('/bin/sh', ['-c', 'command -v "$1" >/dev/null 2>&1', 'sh', command], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore']
  })
  return result.status === 0
}

function commandOutput(command, args) {
  try {
    return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
}

function run(command, args, options = {}) {
  const start = process.hrtime.bigint()
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options
  })
  const ms = Number(process.hrtime.bigint() - start) / 1_000_000

  if (result.error) {
    throw result.error
  }

  return { ms, status: result.status, stdout: result.stdout, stderr: result.stderr }
}

function ensureRustBuild() {
  const result = spawnSync('cargo', ['build', '--release', '--manifest-path', path.join(ROOT, 'native', 'Cargo.toml')], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  })

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'cargo build failed')
  }
}

function installKillPort() {
  const dir = mkdtempSync(path.join(tmpdir(), 'kill-port-now-bench-'))
  const result = spawnSync('npm', ['install', 'kill-port@2.0.1', '--silent'], {
    cwd: dir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  })

  if (result.status !== 0) {
    rmSync(dir, { recursive: true, force: true })
    throw new Error(result.stderr || result.stdout || 'npm install kill-port failed')
  }

  return {
    dir,
    cli: path.join(dir, 'node_modules', 'kill-port', 'cli.js')
  }
}

function startServer(fixture) {
  return new Promise((resolve, reject) => {
    const child = fork(fixture, [], {
      stdio: ['ignore', 'ignore', 'ignore', 'ipc']
    })

    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`timed out waiting for ${fixture}`))
    }, 3000)

    child.once('message', (message) => {
      clearTimeout(timer)
      if (message && typeof message === 'object' && Number.isInteger(message.port)) {
        resolve({ child, port: message.port })
        return
      }

      child.kill('SIGKILL')
      reject(new Error(`invalid fixture port from ${fixture}`))
    })

    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

function waitForExit(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve()
      return
    }

    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve()
    }, 2000)

    child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

async function cleanup(child) {
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL')
  }
  await waitForExit(child)
}

async function getUnusedPort() {
  const { child, port } = await startServer(TCP_FIXTURE)
  child.kill('SIGKILL')
  await waitForExit(child)
  return port
}

function lsofArgs(port, protocol) {
  if (protocol === 'udp') {
    return ['-nP', '-t', `-iUDP:${port}`]
  }

  return ['-nP', '-t', `-iTCP:${port}`, '-sTCP:LISTEN']
}

function rawLsofLookup(port, protocol = 'tcp') {
  return run('lsof', lsofArgs(port, protocol)).ms
}

function rawLsofKill(port, protocol = 'tcp') {
  const start = process.hrtime.bigint()
  const result = spawnSync('lsof', lsofArgs(port, protocol), {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  })

  if (result.error) {
    throw result.error
  }

  killPids(parseLsofPids(result.stdout))
  return Number(process.hrtime.bigint() - start) / 1_000_000
}

function parseLsofPids(stdout) {
  return stdout
    .trim()
    .split(/\s+/)
    .map((token) => Number(token))
    .filter((pid) => Number.isSafeInteger(pid) && pid > 0)
}

function rawNetstatLookup(port, protocol = 'tcp') {
  const start = process.hrtime.bigint()
  const result = spawnSync('netstat', ['-anv', '-p', protocol], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  })

  if (result.error) {
    throw result.error
  }

  parseNetstatPids(result.stdout, port, protocol)
  return Number(process.hrtime.bigint() - start) / 1_000_000
}

function rawNetstatKill(port, protocol = 'tcp') {
  const start = process.hrtime.bigint()
  const result = spawnSync('netstat', ['-anv', '-p', protocol], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  })

  if (result.error) {
    throw result.error
  }

  killPids(parseNetstatPids(result.stdout, port, protocol))
  return Number(process.hrtime.bigint() - start) / 1_000_000
}

function parseNetstatPids(stdout, port, protocol) {
  const pids = []

  for (const line of stdout.split('\n')) {
    const columns = line.trim().split(/\s+/)
    if (columns.length < 4 || !columns[0].startsWith(protocol)) {
      continue
    }

    if (protocol === 'tcp' && !columns.includes('LISTEN')) {
      continue
    }

    if (!localAddressMatchesPort(columns[3], port)) {
      continue
    }

    for (const column of columns) {
      const match = column.match(/^.+:(\d+)$/)
      if (match) {
        const pid = Number(match[1])
        if (Number.isSafeInteger(pid) && pid > 0) {
          pids.push(pid)
        }
      }
    }
  }

  return [...new Set(pids)]
}

function localAddressMatchesPort(address, port) {
  return address.endsWith(`.${port}`) || address.endsWith(`:${port}`)
}

function killPids(pids) {
  for (const pid of new Set(pids)) {
    try {
      process.kill(pid, 'SIGKILL')
    } catch (error) {
      if (!error || typeof error !== 'object' || error.code !== 'ESRCH') {
        throw error
      }
    }
  }
}

function bashDevTcpCheck(port) {
  return run('/bin/bash', ['-c', ': >/dev/tcp/127.0.0.1/$1', 'bash-dev-tcp', String(port)]).ms
}

function bashNetstatKill(port, protocol = 'tcp') {
  const script = `
protocol=$1
port=$2
pid=$(netstat -anv -p "$protocol" | awk -v port=".$port" -v proto="$protocol" '$1 ~ "^" proto && $4 ~ port "$" && (proto == "udp" || $0 ~ /LISTEN/) { for (i=1; i<=NF; i++) if ($i ~ /:[0-9]+$/) { sub(/^.*:/, "", $i); print $i; exit } }')
[ -n "$pid" ] && kill -9 "$pid"
`
  return run('/bin/bash', ['-c', script, 'bash-netstat', protocol, String(port)]).ms
}

async function sampleEmpty(toolFn) {
  const port = await getUnusedPort()
  return toolFn(port)
}

async function sampleKill(fixture, toolFn) {
  const { child, port } = await startServer(fixture)
  try {
    const ms = toolFn(port)
    await cleanup(child)
    return ms
  } catch (error) {
    await cleanup(child)
    throw error
  }
}

async function sampleCheckInUse(toolFn) {
  const { child, port } = await startServer(TCP_FIXTURE)
  try {
    const ms = toolFn(port)
    await cleanup(child)
    return ms
  } catch (error) {
    await cleanup(child)
    throw error
  }
}

async function measure(definition) {
  const samples = []
  for (let index = 0; index < ITERATIONS; index += 1) {
    samples.push(await definition.sample())
  }

  samples.sort((left, right) => left - right)
  const meanMs = samples.reduce((sum, sample) => sum + sample, 0) / samples.length
  const medianMs = samples[Math.floor(samples.length / 2)]

  return {
    scenarioId: definition.scenarioId,
    toolId: definition.toolId,
    operation: definition.operation,
    protocol: definition.protocol,
    destructive: definition.destructive,
    validForKillComparison: definition.validForKillComparison,
    commandLabel: definition.commandLabel,
    notes: definition.notes || [],
    samples,
    meanMs,
    medianMs,
    minMs: samples[0],
    maxMs: samples[samples.length - 1]
  }
}

function markdownTable(title, rows) {
  console.log(`\n${title}`)
  console.log('| Tool | Mean | Median | Chart |')
  console.log('| --- | ---: | ---: | --- |')

  const max = Math.max(...rows.map((row) => row.meanMs))
  for (const row of rows) {
    const tool = TOOLS.find((item) => item.id === row.toolId)
    const units = Math.max(1, Math.round((row.meanMs / max) * 40))
    const bar = '█'.repeat(units)
    console.log(`| ${tool.name} | ${row.meanMs.toFixed(2)} ms | ${row.medianMs.toFixed(2)} ms | ${bar} |`)
  }
}

function writeBenchmarkData(data) {
  mkdirSync(BENCHMARK_DATA_DIR, { recursive: true })
  writeFileSync(path.join(BENCHMARK_DATA_DIR, 'latest.json'), `${JSON.stringify(data, null, 2)}\n`)
  writeFileSync(path.join(BENCHMARK_DATA_DIR, 'latest.js'), `window.KP_BENCHMARK_DATA = ${JSON.stringify(data, null, 2)};\n`)
}

function environment() {
  return {
    generatedAt: new Date().toISOString(),
    iterations: ITERATIONS,
    os: commandOutput('uname', ['-s']),
    arch: commandOutput('uname', ['-m']),
    node: process.version,
    rustc: commandOutput('rustc', ['--version']),
    lsof: commandExists('lsof') ? commandOutput('lsof', ['-v'])?.split('\n')[0] || 'available' : 'missing',
    bash: commandOutput('/bin/bash', ['--version'])?.split('\n')[0] || null
  }
}

async function main() {
  ensureRustBuild()
  const killPort = installKillPort()

  try {
    const oldCli = ['node', [killPort.cli]]
    const jsCli = ['node', [JS_KP, '--quiet']]
    const rustCli = [NATIVE_KP, ['--quiet']]
    const fpCli = [RUST_FP, []]

    const definitions = [
      {
        scenarioId: 'empty-port',
        toolId: 'kill-port',
        operation: 'no-op',
        protocol: 'tcp',
        destructive: false,
        validForKillComparison: true,
        commandLabel: 'node kill-port/cli.js <free-port>',
        sample: () => sampleEmpty((port) => run(oldCli[0], [...oldCli[1], String(port)]).ms)
      },
      {
        scenarioId: 'empty-port',
        toolId: 'kill-port-now-js',
        operation: 'no-op',
        protocol: 'tcp',
        destructive: false,
        validForKillComparison: true,
        commandLabel: 'node bin/kp-js --quiet <free-port>',
        sample: () => sampleEmpty((port) => run(jsCli[0], [...jsCli[1], String(port)]).ms)
      },
      {
        scenarioId: 'empty-port',
        toolId: 'macos-lsof',
        operation: 'lookup',
        protocol: 'tcp',
        destructive: false,
        validForKillComparison: false,
        commandLabel: 'lsof -nP -t -iTCP:<port> -sTCP:LISTEN',
        notes: ['Lookup only; included to isolate macOS lsof cost.'],
        sample: () => sampleEmpty((port) => rawLsofLookup(port, 'tcp'))
      },
      {
        scenarioId: 'empty-port',
        toolId: 'macos-netstat',
        operation: 'lookup',
        protocol: 'tcp',
        destructive: false,
        validForKillComparison: false,
        commandLabel: 'netstat -anv -p tcp',
        notes: ['Lookup only; no lsof. macOS netstat exposes command:pid in verbose mode.'],
        sample: () => sampleEmpty((port) => rawNetstatLookup(port, 'tcp'))
      },
      {
        scenarioId: 'empty-port',
        toolId: 'kill-port-now-rust',
        operation: 'no-op',
        protocol: 'tcp',
        destructive: false,
        validForKillComparison: true,
        commandLabel: 'bin/kp --quiet <free-port>',
        sample: () => sampleEmpty((port) => run(rustCli[0], [...rustCli[1], String(port)]).ms)
      },
      {
        scenarioId: 'tcp-kill',
        toolId: 'kill-port',
        operation: 'kill',
        protocol: 'tcp',
        destructive: true,
        validForKillComparison: true,
        commandLabel: 'node kill-port/cli.js <port>',
        sample: () => sampleKill(TCP_FIXTURE, (port) => run(oldCli[0], [...oldCli[1], String(port)]).ms)
      },
      {
        scenarioId: 'tcp-kill',
        toolId: 'kill-port-now-js',
        operation: 'kill',
        protocol: 'tcp',
        destructive: true,
        validForKillComparison: true,
        commandLabel: 'node bin/kp-js --quiet <port>',
        sample: () => sampleKill(TCP_FIXTURE, (port) => run(jsCli[0], [...jsCli[1], String(port)]).ms)
      },
      {
        scenarioId: 'tcp-kill',
        toolId: 'macos-lsof',
        operation: 'kill',
        protocol: 'tcp',
        destructive: true,
        validForKillComparison: true,
        commandLabel: 'lsof -nP -t -iTCP:<port> -sTCP:LISTEN + kill',
        sample: () => sampleKill(TCP_FIXTURE, (port) => rawLsofKill(port, 'tcp'))
      },
      {
        scenarioId: 'tcp-kill',
        toolId: 'macos-netstat',
        operation: 'kill',
        protocol: 'tcp',
        destructive: true,
        validForKillComparison: true,
        commandLabel: 'netstat -anv -p tcp + kill',
        notes: ['No lsof. Parses macOS verbose netstat command:pid column.'],
        sample: () => sampleKill(TCP_FIXTURE, (port) => rawNetstatKill(port, 'tcp'))
      },
      {
        scenarioId: 'tcp-kill',
        toolId: 'bash-netstat',
        operation: 'kill',
        protocol: 'tcp',
        destructive: true,
        validForKillComparison: true,
        commandLabel: 'bash: netstat -anv -p tcp | awk + kill',
        notes: ['No lsof. macOS-specific shell implementation.'],
        sample: () => sampleKill(TCP_FIXTURE, (port) => bashNetstatKill(port, 'tcp'))
      },
      {
        scenarioId: 'tcp-kill',
        toolId: 'kill-port-now-rust',
        operation: 'kill',
        protocol: 'tcp',
        destructive: true,
        validForKillComparison: true,
        commandLabel: 'bin/kp --quiet <port>',
        sample: () => sampleKill(TCP_FIXTURE, (port) => run(rustCli[0], [...rustCli[1], String(port)]).ms)
      },
      {
        scenarioId: 'udp-kill',
        toolId: 'kill-port',
        operation: 'kill',
        protocol: 'udp',
        destructive: true,
        validForKillComparison: true,
        commandLabel: 'node kill-port/cli.js --method udp <port>',
        sample: () => sampleKill(UDP_FIXTURE, (port) => run(oldCli[0], [...oldCli[1], '--method', 'udp', String(port)]).ms)
      },
      {
        scenarioId: 'udp-kill',
        toolId: 'kill-port-now-js',
        operation: 'kill',
        protocol: 'udp',
        destructive: true,
        validForKillComparison: true,
        commandLabel: 'node bin/kp-js --quiet --method udp <port>',
        sample: () => sampleKill(UDP_FIXTURE, (port) => run(jsCli[0], [...jsCli[1], '--method', 'udp', String(port)]).ms)
      },
      {
        scenarioId: 'udp-kill',
        toolId: 'macos-lsof',
        operation: 'kill',
        protocol: 'udp',
        destructive: true,
        validForKillComparison: true,
        commandLabel: 'lsof -nP -t -iUDP:<port> + kill',
        sample: () => sampleKill(UDP_FIXTURE, (port) => rawLsofKill(port, 'udp'))
      },
      {
        scenarioId: 'udp-kill',
        toolId: 'macos-netstat',
        operation: 'kill',
        protocol: 'udp',
        destructive: true,
        validForKillComparison: true,
        commandLabel: 'netstat -anv -p udp + kill',
        notes: ['No lsof. Parses macOS verbose netstat command:pid column.'],
        sample: () => sampleKill(UDP_FIXTURE, (port) => rawNetstatKill(port, 'udp'))
      },
      {
        scenarioId: 'udp-kill',
        toolId: 'bash-netstat',
        operation: 'kill',
        protocol: 'udp',
        destructive: true,
        validForKillComparison: true,
        commandLabel: 'bash: netstat -anv -p udp | awk + kill',
        notes: ['No lsof. macOS-specific shell implementation.'],
        sample: () => sampleKill(UDP_FIXTURE, (port) => bashNetstatKill(port, 'udp'))
      },
      {
        scenarioId: 'udp-kill',
        toolId: 'kill-port-now-rust',
        operation: 'kill',
        protocol: 'udp',
        destructive: true,
        validForKillComparison: true,
        commandLabel: 'bin/kp --quiet --method udp <port>',
        sample: () => sampleKill(UDP_FIXTURE, (port) => run(rustCli[0], [...rustCli[1], '--method', 'udp', String(port)]).ms)
      },
      {
        scenarioId: 'tcp-check-free',
        toolId: 'bash-dev-tcp',
        operation: 'check',
        protocol: 'tcp',
        destructive: false,
        validForKillComparison: false,
        commandLabel: '/bin/bash -c : >/dev/tcp/127.0.0.1/<port>',
        notes: ['TCP reachability check only; cannot identify or kill PID.'],
        sample: () => sampleEmpty((port) => bashDevTcpCheck(port))
      },
      {
        scenarioId: 'tcp-check-free',
        toolId: 'fp-rs',
        operation: 'check',
        protocol: 'tcp',
        destructive: false,
        validForKillComparison: false,
        commandLabel: 'native/target/release/fp-rs <free-port>',
        sample: () => sampleEmpty((port) => run(fpCli[0], [...fpCli[1], String(port)]).ms)
      },
      {
        scenarioId: 'tcp-check-free',
        toolId: 'macos-lsof',
        operation: 'lookup',
        protocol: 'tcp',
        destructive: false,
        validForKillComparison: false,
        commandLabel: 'lsof -nP -t -iTCP:<port> -sTCP:LISTEN',
        sample: () => sampleEmpty((port) => rawLsofLookup(port, 'tcp'))
      },
      {
        scenarioId: 'tcp-check-free',
        toolId: 'macos-netstat',
        operation: 'lookup',
        protocol: 'tcp',
        destructive: false,
        validForKillComparison: false,
        commandLabel: 'netstat -anv -p tcp',
        notes: ['No lsof. Can map port to PID on macOS, unlike bash /dev/tcp.'],
        sample: () => sampleEmpty((port) => rawNetstatLookup(port, 'tcp'))
      },
      {
        scenarioId: 'tcp-check-in-use',
        toolId: 'bash-dev-tcp',
        operation: 'check',
        protocol: 'tcp',
        destructive: false,
        validForKillComparison: false,
        commandLabel: '/bin/bash -c : >/dev/tcp/127.0.0.1/<port>',
        notes: ['TCP reachability check only; cannot identify or kill PID.'],
        sample: () => sampleCheckInUse((port) => bashDevTcpCheck(port))
      },
      {
        scenarioId: 'tcp-check-in-use',
        toolId: 'fp-rs',
        operation: 'check',
        protocol: 'tcp',
        destructive: false,
        validForKillComparison: false,
        commandLabel: 'native/target/release/fp-rs <used-port>',
        sample: () => sampleCheckInUse((port) => run(fpCli[0], [...fpCli[1], String(port)]).ms)
      },
      {
        scenarioId: 'tcp-check-in-use',
        toolId: 'macos-lsof',
        operation: 'lookup',
        protocol: 'tcp',
        destructive: false,
        validForKillComparison: false,
        commandLabel: 'lsof -nP -t -iTCP:<port> -sTCP:LISTEN',
        sample: () => sampleCheckInUse((port) => rawLsofLookup(port, 'tcp'))
      },
      {
        scenarioId: 'tcp-check-in-use',
        toolId: 'macos-netstat',
        operation: 'lookup',
        protocol: 'tcp',
        destructive: false,
        validForKillComparison: false,
        commandLabel: 'netstat -anv -p tcp',
        notes: ['No lsof. Can map port to PID on macOS, unlike bash /dev/tcp.'],
        sample: () => sampleCheckInUse((port) => rawNetstatLookup(port, 'tcp'))
      }
    ]

    const rows = []
    for (const definition of definitions) {
      rows.push(await measure(definition))
    }

    const data = {
      runId: new Date().toISOString().replace(/[:.]/g, '-'),
      environment: environment(),
      assumptions: [
        'Single-port benchmarks use temporary local fixture processes.',
        'macOS lsof rows isolate targeted lsof cost and do not represent the legacy kill-port shell pipeline.',
        'bash /dev/tcp rows are checks only. They cannot map a port to a PID or kill it safely.',
        'Lower is better. Results vary with process count and machine load.'
      ],
      tools: TOOLS,
      scenarios: SCENARIOS,
      rows
    }

    writeBenchmarkData(data)

    console.log(`Iterations: ${ITERATIONS}`)
    console.log(`Data: ${path.join(BENCHMARK_DATA_DIR, 'latest.json')}`)
    for (const scenario of SCENARIOS) {
      markdownTable(scenario.name, rows.filter((row) => row.scenarioId === scenario.id))
    }
  } finally {
    rmSync(killPort.dir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
