'use strict'

const assert = require('node:assert/strict')
const { execFileSync, fork } = require('node:child_process')
const { mkdtempSync, readFileSync, rmSync, symlinkSync } = require('node:fs')
const net = require('node:net')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const {
  findPidsForPort,
  findPortProcesses,
  killPort,
  parsePort,
  parsePorts
} = require('../index.js')

const packageJsonPath = path.join(__dirname, '..', 'package.json')
const kpWrapperPath = path.join(__dirname, '..', 'bin', 'kp.js')
const tcpFixturePath = path.join(__dirname, '..', 'benchmarks', 'fixtures', 'server.js')
const stubbornFixturePath = path.join(__dirname, '..', 'benchmarks', 'fixtures', 'stubborn-server.js')
const udpFixturePath = path.join(__dirname, '..', 'benchmarks', 'fixtures', 'udp-server.js')

function runKp(args) {
  return execFileSync(process.execPath, [kpWrapperPath, ...args], { encoding: 'utf8' })
}

function startServer(fixturePath = tcpFixturePath) {
  return new Promise((resolve, reject) => {
    const child = fork(fixturePath, [], {
      stdio: ['ignore', 'ignore', 'ignore', 'ipc']
    })

    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error('Timed out waiting for fixture server'))
    }, 3000)

    child.once('message', (message) => {
      clearTimeout(timer)
      if (message && typeof message === 'object' && Number.isInteger(message.port)) {
        resolve({ child, port: message.port })
        return
      }

      child.kill('SIGKILL')
      reject(new Error('Fixture server sent an invalid port'))
    })

    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })

    child.once('exit', (code, signal) => {
      clearTimeout(timer)
      reject(new Error(`Fixture server exited before listening: ${code ?? signal}`))
    })
  })
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Timed out waiting for child exit'))
    }, 3000)

    child.once('exit', (code, signal) => {
      clearTimeout(timer)
      resolve({ code, signal })
    })
  })
}

function assertForcefulExit(exit) {
  if (process.platform === 'win32') {
    assert.notEqual(exit.code, null)
    return
  }

  assert.equal(exit.signal, 'SIGKILL')
}

function getUnusedTcpPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address !== 'object') {
        server.close(() => reject(new Error('Could not allocate a TCP port')))
        return
      }

      const port = address.port
      server.close(() => resolve(port))
    })
    server.once('error', reject)
  })
}

async function waitForPid(port, pid, method = 'all') {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const pids = await findPidsForPort(port, method)
    if (pids.includes(pid)) {
      return pids
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 50)
    })
  }

  return findPidsForPort(port, method)
}

async function waitForProcess(port, pid, options = {}) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const processes = await findPortProcesses(port, options)
    if (processes.some((processInfo) => processInfo.pid === pid)) {
      return processes
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 50)
    })
  }

  return findPortProcesses(port, options)
}

test('package metadata does not define npm install lifecycle scripts', () => {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
  const scripts = packageJson.scripts ?? {}

  for (const scriptName of ['preinstall', 'install', 'postinstall']) {
    assert.equal(scripts[scriptName], undefined, `${scriptName} should not be defined`)
  }
})

test('kp wrapper resolves npm-style bin symlinks', { skip: process.platform === 'win32' }, () => {
  const tempDirectory = mkdtempSync(path.join(os.tmpdir(), 'kp-bin-'))

  try {
    const symlinkPath = path.join(tempDirectory, 'kp')
    symlinkSync(kpWrapperPath, symlinkPath)

    const output = execFileSync(symlinkPath, ['--help'], { encoding: 'utf8' })
    assert.match(output, /Usage:/)
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true })
  }
})

test('parsePort accepts valid port numbers', () => {
  assert.equal(parsePort(3000), 3000)
  assert.equal(parsePort(' 5173 '), 5173)
})

test('parsePort rejects invalid input', () => {
  assert.throws(() => parsePort(0), /between 1 and 65535/)
  assert.throws(() => parsePort(65536), /between 1 and 65535/)
  assert.throws(() => parsePort('3000; rm -rf /'), /Invalid port/)
})

test('parsePorts supports comma-separated and repeated ports', () => {
  assert.deepEqual(parsePorts(['3000, 3001', 3000]), [3000, 3001])
})

test('findPortProcesses returns process info and filters protocols', async (t) => {
  const { child, port } = await startServer()
  t.after(() => {
    if (!child.killed) {
      child.kill('SIGKILL')
    }
  })

  const processes = await waitForProcess(port, child.pid)
  const match = processes.find((processInfo) => processInfo.pid === child.pid)
  assert.ok(match)
  assert.equal(match.port, port)
  assert.equal(match.protocol, 'tcp')

  const udpProcesses = await findPortProcesses(port, { protocol: 'udp' })
  assert.equal(udpProcesses.some((processInfo) => processInfo.pid === child.pid), false)
})

test('killPort kills the process listening on a TCP port', async (t) => {
  const { child, port } = await startServer()
  t.after(() => {
    if (!child.killed) {
      child.kill('SIGKILL')
    }
  })

  const pids = await waitForPid(port, child.pid)
  assert.ok(pids.includes(child.pid))

  const exitPromise = waitForExit(child)
  const result = await killPort(port)
  assert.equal(result.port, port)
  assert.equal(result.protocol, 'all')
  assert.ok(result.processes.some((processInfo) => processInfo.pid === child.pid && processInfo.protocol === 'tcp'))
  assert.ok(result.pids.includes(child.pid))
  assert.ok(result.killed.includes(child.pid))
  assert.deepEqual(result.failed, [])

  const exit = await exitPromise
  assertForcefulExit(exit)
})

test('killPort defaults to freeing UDP ports too', async (t) => {
  const { child, port } = await startServer(udpFixturePath)
  t.after(() => {
    if (!child.killed) {
      child.kill('SIGKILL')
    }
  })

  const pids = await waitForPid(port, child.pid)
  assert.ok(pids.includes(child.pid))

  const exitPromise = waitForExit(child)
  const result = await killPort(port)
  assert.equal(result.protocol, 'all')
  assert.ok(result.processes.some((processInfo) => processInfo.pid === child.pid && processInfo.protocol === 'udp'))
  assert.ok(result.killed.includes(child.pid))

  const exit = await exitPromise
  assertForcefulExit(exit)
})

test('killPort dryRun reports matches without killing', async (t) => {
  const { child, port } = await startServer()
  t.after(() => {
    if (!child.killed) {
      child.kill('SIGKILL')
    }
  })

  const pids = await waitForPid(port, child.pid)
  assert.ok(pids.includes(child.pid))

  const result = await killPort(port, { dryRun: true })
  assert.ok(result.pids.includes(child.pid))
  assert.ok(result.killed.includes(child.pid))
  assert.equal(result.dryRun, true)
  assert.equal(child.exitCode, null)
})

test("killPort accepts kill-port's method string argument", async (t) => {
  const { child, port } = await startServer(udpFixturePath)
  t.after(() => {
    if (!child.killed) {
      child.kill('SIGKILL')
    }
  })

  const pids = await waitForPid(port, child.pid, 'udp')
  assert.ok(pids.includes(child.pid))

  const exitPromise = waitForExit(child)
  const result = await killPort(port, 'udp')
  assert.equal(result.protocol, 'udp')
  assert.ok(result.killed.includes(child.pid))

  const exit = await exitPromise
  assertForcefulExit(exit)
})

test('kp --dry-run --json returns process info without killing', async (t) => {
  const { child, port } = await startServer()
  t.after(() => {
    if (!child.killed) {
      child.kill('SIGKILL')
    }
  })

  await waitForPid(port, child.pid)

  const output = runKp([String(port), '--dry-run', '--json'])
  const payload = JSON.parse(output)
  assert.equal(payload.results.length, 1)
  assert.equal(payload.results[0].port, port)
  assert.equal(payload.results[0].dryRun, true)
  assert.ok(payload.results[0].processes.some((processInfo) => processInfo.pid === child.pid && processInfo.protocol === 'tcp'))
  assert.equal(child.exitCode, null)
})

test('kp --json prints kill results', async (t) => {
  const { child, port } = await startServer()
  t.after(() => {
    if (!child.killed) {
      child.kill('SIGKILL')
    }
  })

  await waitForPid(port, child.pid)
  const exitPromise = waitForExit(child)
  const output = runKp([String(port), '--json'])
  const payload = JSON.parse(output)
  assert.equal(payload.results.length, 1)
  assert.equal(payload.results[0].port, port)
  assert.ok(payload.results[0].killed.includes(child.pid))

  const exit = await exitPromise
  assertForcefulExit(exit)
})

test('kp --graceful escalates after the graceful timeout', { skip: process.platform === 'win32' }, async (t) => {
  const { child, port } = await startServer(stubbornFixturePath)
  t.after(() => {
    if (!child.killed) {
      child.kill('SIGKILL')
    }
  })

  await waitForPid(port, child.pid)
  const exitPromise = waitForExit(child)
  runKp([String(port), '--graceful', '--graceful-timeout', '50'])

  const exit = await exitPromise
  assertForcefulExit(exit)
})

test("killPort rejects free ports like kill-port's API", async () => {
  const port = await getUnusedTcpPort()
  await assert.rejects(killPort(port), /No process running on port/)

  const result = await killPort(port, { rejectOnNotFound: false })
  assert.deepEqual(result.pids, [])
  assert.deepEqual(result.killed, [])
})
