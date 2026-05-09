'use strict'

const assert = require('node:assert/strict')
const { execFileSync, fork } = require('node:child_process')
const path = require('node:path')
const test = require('node:test')
const {
  findPidsForPort,
  killPort,
  parsePort,
  parsePorts
} = require('../index.js')

const fixturePath = path.join(__dirname, '..', 'fixtures', 'server.js')

function hasLsof() {
  try {
    execFileSync('lsof', ['-v'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function startServer() {
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

async function waitForPid(port, pid) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const pids = await findPidsForPort(port)
    if (pids.includes(pid)) {
      return pids
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 50)
    })
  }

  return findPidsForPort(port)
}

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

test('killPort kills the process listening on a TCP port', { skip: !hasLsof() }, async (t) => {
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
  assert.ok(result.pids.includes(child.pid))
  assert.ok(result.killed.includes(child.pid))
  assert.deepEqual(result.failed, [])

  const exit = await exitPromise
  assert.equal(exit.signal, 'SIGKILL')
})

test('killPort dryRun reports matches without killing', { skip: !hasLsof() }, async (t) => {
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
  assert.equal(child.exitCode, null)
})
