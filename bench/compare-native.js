#!/usr/bin/env node
'use strict'

const { fork, spawnSync } = require('node:child_process')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const path = require('node:path')

const ITERATIONS = Number(process.env.ITERATIONS || 3)
const ROOT = path.join(__dirname, '..')
const TCP_FIXTURE = path.join(ROOT, 'fixtures', 'server.js')
const UDP_FIXTURE = path.join(ROOT, 'fixtures', 'udp-server.js')
const RUST_KP = path.join(ROOT, 'native', 'target', 'release', process.platform === 'win32' ? 'kp-rs.exe' : 'kp-rs')
const RUST_FP = path.join(ROOT, 'native', 'target', 'release', process.platform === 'win32' ? 'fp-rs.exe' : 'fp-rs')
const JS_KP = path.join(ROOT, 'bin', 'kp')

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

async function getUnusedPort() {
  const { child, port } = await startServer(TCP_FIXTURE)
  child.kill('SIGKILL')
  await waitForExit(child)
  return port
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

async function measure(label, fn) {
  const samples = []
  for (let index = 0; index < ITERATIONS; index += 1) {
    samples.push(await fn())
  }

  samples.sort((left, right) => left - right)
  const mean = samples.reduce((sum, sample) => sum + sample, 0) / samples.length
  const median = samples[Math.floor(samples.length / 2)]
  return { label, mean, median, min: samples[0], max: samples[samples.length - 1] }
}

function printTable(title, rows) {
  console.log(`\n${title}`)
  console.log('| Tool | Mean | Median | Chart |')
  console.log('| --- | ---: | ---: | --- |')

  const max = Math.max(...rows.map((row) => row.mean))
  for (const row of rows) {
    const units = Math.max(1, Math.round((row.mean / max) * 40))
    const bar = '█'.repeat(units)
    console.log(`| ${row.label} | ${row.mean.toFixed(2)} ms | ${row.median.toFixed(2)} ms | ${bar} |`)
  }
}

async function commandKill(command, args, fixture) {
  const { child, port } = await startServer(fixture)
  const result = run(command, [...args, String(port)])
  await cleanup(child)
  return result.ms
}

async function main() {
  ensureRustBuild()
  const killPort = installKillPort()

  try {
    const oldCli = ['node', [killPort.cli]]
    const jsCli = ['node', [JS_KP, '--quiet']]
    const rustCli = [RUST_KP, ['--quiet']]

    const emptyPortRows = []
    emptyPortRows.push(await measure('kill-port', async () => {
      const port = await getUnusedPort()
      return run(oldCli[0], [...oldCli[1], String(port)]).ms
    }))
    emptyPortRows.push(await measure('kill-port-now JS', async () => {
      const port = await getUnusedPort()
      return run(jsCli[0], [...jsCli[1], String(port)]).ms
    }))
    emptyPortRows.push(await measure('kp-rs', async () => {
      const port = await getUnusedPort()
      return run(rustCli[0], [...rustCli[1], String(port)]).ms
    }))

    const tcpRows = []
    tcpRows.push(await measure('kill-port', () => commandKill(oldCli[0], oldCli[1], TCP_FIXTURE)))
    tcpRows.push(await measure('kill-port-now JS', () => commandKill(jsCli[0], jsCli[1], TCP_FIXTURE)))
    tcpRows.push(await measure('kp-rs', () => commandKill(rustCli[0], rustCli[1], TCP_FIXTURE)))

    const udpRows = []
    udpRows.push(await measure('kill-port', () => commandKill(oldCli[0], [...oldCli[1], '--method', 'udp'], UDP_FIXTURE)))
    udpRows.push(await measure('kill-port-now JS', () => commandKill(jsCli[0], [...jsCli[1], '--method', 'udp'], UDP_FIXTURE)))
    udpRows.push(await measure('kp-rs', () => commandKill(rustCli[0], [...rustCli[1], '--method', 'udp'], UDP_FIXTURE)))

    const fpRows = []
    fpRows.push(await measure('fp-rs', async () => run(RUST_FP, [String(await getUnusedPort())]).ms))

    console.log(`Iterations: ${ITERATIONS}`)
    printTable('Empty port', emptyPortRows)
    printTable('TCP kill', tcpRows)
    printTable('UDP kill', udpRows)
    printTable('Free-port check', fpRows)
  } finally {
    rmSync(killPort.dir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
