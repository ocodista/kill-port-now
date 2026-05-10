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
const DEFAULT_KP = path.join(ROOT, 'bin', 'kp')
const NATIVE_KP = nativeBinaryPath('kp-rs') || DEFAULT_KP
const BENCHMARK_DATA_DIR = path.join(ROOT, 'benchmarks', 'data')

const SCENARIOS = [
  { id: 'empty-port', name: 'Empty port', description: 'No listener exists. Measures no-op/rejection overhead.' },
  { id: 'udp-kill', name: 'UDP kill', description: 'Kill a temporary UDP socket.' },
  { id: 'tcp-kill', name: 'TCP kill', description: 'Kill a temporary TCP listener.' }
]

const TOOLS = [
  { id: 'kill-port', name: 'kill-port', usesLsof: true, usesShellPipeline: true, native: false },
  { id: 'kill-port-now', name: 'kill-port-now', usesLsof: false, usesShellPipeline: false, native: true }
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
    validForKillComparison: true,
    commandLabel: definition.commandLabel,
    notes: [],
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
    rustc: commandOutput('rustc', ['--version'])
  }
}

function benchmarkDefinitions(oldCli, currentCli) {
  return [
    {
      scenarioId: 'empty-port',
      toolId: 'kill-port',
      operation: 'no-op',
      protocol: 'tcp',
      destructive: false,
      commandLabel: 'node kill-port/cli.js <free-port>',
      sample: () => sampleEmpty((port) => run(oldCli[0], [...oldCli[1], String(port)]).ms)
    },
    {
      scenarioId: 'empty-port',
      toolId: 'kill-port-now',
      operation: 'no-op',
      protocol: 'tcp',
      destructive: false,
      commandLabel: 'bin/kp --quiet <free-port>',
      sample: () => sampleEmpty((port) => run(currentCli[0], [...currentCli[1], String(port)]).ms)
    },
    {
      scenarioId: 'udp-kill',
      toolId: 'kill-port',
      operation: 'kill',
      protocol: 'udp',
      destructive: true,
      commandLabel: 'node kill-port/cli.js --method udp <port>',
      sample: () => sampleKill(UDP_FIXTURE, (port) => run(oldCli[0], [...oldCli[1], '--method', 'udp', String(port)]).ms)
    },
    {
      scenarioId: 'udp-kill',
      toolId: 'kill-port-now',
      operation: 'kill',
      protocol: 'udp',
      destructive: true,
      commandLabel: 'bin/kp --quiet --method udp <port>',
      sample: () => sampleKill(UDP_FIXTURE, (port) => run(currentCli[0], [...currentCli[1], '--method', 'udp', String(port)]).ms)
    },
    {
      scenarioId: 'tcp-kill',
      toolId: 'kill-port',
      operation: 'kill',
      protocol: 'tcp',
      destructive: true,
      commandLabel: 'node kill-port/cli.js <port>',
      sample: () => sampleKill(TCP_FIXTURE, (port) => run(oldCli[0], [...oldCli[1], String(port)]).ms)
    },
    {
      scenarioId: 'tcp-kill',
      toolId: 'kill-port-now',
      operation: 'kill',
      protocol: 'tcp',
      destructive: true,
      commandLabel: 'bin/kp --quiet <port>',
      sample: () => sampleKill(TCP_FIXTURE, (port) => run(currentCli[0], [...currentCli[1], String(port)]).ms)
    }
  ]
}

async function main() {
  ensureRustBuild()
  const killPort = installKillPort()

  try {
    const oldCli = ['node', [killPort.cli]]
    const currentCli = [NATIVE_KP, ['--quiet']]
    const rows = []

    for (const definition of benchmarkDefinitions(oldCli, currentCli)) {
      rows.push(await measure(definition))
    }

    const data = {
      runId: new Date().toISOString().replace(/[:.]/g, '-'),
      environment: environment(),
      assumptions: [
        'Compares only kill-port@2.0.1 and kill-port-now.',
        'Single-port benchmarks use temporary local fixture processes.',
        'Empty port measures no-op overhead when no listener exists.',
        'UDP kill and TCP kill start a fresh fixture process for each sample.',
        'Rows report mean, median, min, and max. Lower is better.',
        'Results vary with machine load and process count.'
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
