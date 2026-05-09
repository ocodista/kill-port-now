'use strict'

const { execFile } = require('node:child_process')
const { promisify } = require('node:util')

const execFileAsync = promisify(execFile)

const MAX_PORT = 65535
const DEFAULT_PROTOCOL = 'tcp'
const DEFAULT_SIGNAL = 'SIGKILL'
const VALID_PROTOCOLS = new Set(['tcp', 'udp', 'all'])

function parsePort(value) {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new TypeError('Port must be a number or numeric string')
  }

  const text = String(value).trim()
  if (!/^\d+$/.test(text)) {
    throw new TypeError(`Invalid port: ${String(value)}`)
  }

  const port = Number(text)
  if (!Number.isSafeInteger(port) || port < 1 || port > MAX_PORT) {
    throw new RangeError(`Port must be between 1 and ${MAX_PORT}: ${String(value)}`)
  }

  return port
}

function parsePorts(values) {
  const source = Array.isArray(values) ? values : [values]
  const ports = []

  for (const value of source) {
    if (typeof value !== 'string' && typeof value !== 'number') {
      throw new TypeError('Ports must be numbers or numeric strings')
    }

    const parts = String(value).split(',')
    for (const part of parts) {
      const text = part.trim()
      if (text.length > 0) {
        ports.push(parsePort(text))
      }
    }
  }

  if (ports.length === 0) {
    throw new TypeError('At least one port is required')
  }

  return [...new Set(ports)]
}

function normalizeProtocol(protocol = DEFAULT_PROTOCOL) {
  if (typeof protocol !== 'string') {
    throw new TypeError('Protocol must be tcp, udp, or all')
  }

  const normalized = protocol.toLowerCase()
  if (!VALID_PROTOCOLS.has(normalized)) {
    throw new TypeError(`Invalid protocol: ${protocol}`)
  }

  return normalized
}

function normalizeOptions(options = {}) {
  if (typeof options === 'string') {
    return { method: options }
  }

  if (options && typeof options === 'object' && !Array.isArray(options)) {
    return options
  }

  throw new TypeError('Options must be a protocol string or an options object')
}

function protocolFromOptions(options) {
  const normalizedOptions = normalizeOptions(options)
  return normalizeProtocol(normalizedOptions.protocol ?? normalizedOptions.method)
}

function normalizeSignal(signal = DEFAULT_SIGNAL) {
  if (typeof signal === 'number') {
    if (!Number.isSafeInteger(signal) || signal < 1) {
      throw new TypeError(`Invalid signal: ${String(signal)}`)
    }

    return signal
  }

  if (typeof signal !== 'string' || signal.trim().length === 0) {
    throw new TypeError(`Invalid signal: ${String(signal)}`)
  }

  const trimmed = signal.trim()
  if (/^\d+$/.test(trimmed)) {
    const numericSignal = Number(trimmed)
    if (!Number.isSafeInteger(numericSignal) || numericSignal < 1) {
      throw new TypeError(`Invalid signal: ${String(signal)}`)
    }

    return numericSignal
  }

  const upperSignal = trimmed.toUpperCase()
  return upperSignal.startsWith('SIG') ? upperSignal : `SIG${upperSignal}`
}

function getErrorProperty(error, property) {
  if (error && typeof error === 'object' && property in error) {
    return error[property]
  }

  return undefined
}

function parsePidOutput(stdout) {
  if (typeof stdout !== 'string' || stdout.trim().length === 0) {
    return []
  }

  const pids = []
  for (const token of stdout.trim().split(/\s+/)) {
    const pid = Number(token)
    if (Number.isSafeInteger(pid) && pid > 0) {
      pids.push(pid)
    }
  }

  return [...new Set(pids)]
}

function lsofArgsForPort(port, protocol) {
  if (protocol === 'tcp') {
    return ['-nP', '-t', `-iTCP:${port}`, '-sTCP:LISTEN']
  }

  if (protocol === 'udp') {
    return ['-nP', '-t', `-iUDP:${port}`]
  }

  throw new TypeError(`Invalid protocol for lsof: ${protocol}`)
}

async function runLsof(args) {
  try {
    const result = await execFileAsync('lsof', args, {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024
    })
    return result.stdout
  } catch (error) {
    const code = getErrorProperty(error, 'code')
    if (code === 1) {
      const stdout = getErrorProperty(error, 'stdout')
      return typeof stdout === 'string' ? stdout : ''
    }

    if (code === 'ENOENT') {
      throw new Error('lsof is required but was not found in PATH')
    }

    throw error
  }
}

async function findPidsForPort(portInput, options = {}) {
  const port = parsePort(portInput)
  const protocol = protocolFromOptions(options)

  if (protocol === 'all') {
    const [tcpPids, udpPids] = await Promise.all([
      findPidsForPort(port, { protocol: 'tcp' }),
      findPidsForPort(port, { protocol: 'udp' })
    ])
    return [...new Set([...tcpPids, ...udpPids])]
  }

  const stdout = await runLsof(lsofArgsForPort(port, protocol))
  return parsePidOutput(stdout)
}

function killPids(pids, signal, dryRun) {
  const killed = []
  const failed = []

  for (const pid of pids) {
    if (dryRun) {
      killed.push(pid)
      continue
    }

    try {
      process.kill(pid, signal)
      killed.push(pid)
    } catch (error) {
      const code = getErrorProperty(error, 'code')
      if (code === 'ESRCH') {
        continue
      }

      const message = error instanceof Error ? error.message : String(error)
      failed.push({
        pid,
        code: typeof code === 'string' ? code : 'ERR_KILL_FAILED',
        message
      })
    }
  }

  return { killed, failed }
}

async function killPort(portInput, options = {}) {
  const port = parsePort(portInput)
  const normalizedOptions = normalizeOptions(options)
  const protocol = normalizeProtocol(normalizedOptions.protocol ?? normalizedOptions.method)
  const signal = normalizeSignal(normalizedOptions.signal)
  const dryRun = normalizedOptions.dryRun === true
  const rejectOnNotFound = normalizedOptions.rejectOnNotFound !== false
  const pids = await findPidsForPort(port, { protocol })

  if (pids.length === 0 && rejectOnNotFound) {
    throw new Error('No process running on port')
  }

  const outcome = killPids(pids, signal, dryRun)

  return {
    port,
    protocol,
    pids,
    killed: outcome.killed,
    failed: outcome.failed
  }
}

async function killPorts(portInputs, options = {}) {
  const ports = parsePorts(portInputs)
  const normalizedOptions = normalizeOptions(options)
  const protocol = normalizeProtocol(normalizedOptions.protocol ?? normalizedOptions.method)
  const signal = normalizeSignal(normalizedOptions.signal)
  const dryRun = normalizedOptions.dryRun === true
  const rejectOnNotFound = normalizedOptions.rejectOnNotFound === true

  const lookups = await Promise.all(
    ports.map(async (port) => ({
      port,
      protocol,
      pids: await findPidsForPort(port, { protocol })
    }))
  )

  const missingLookup = lookups.find((lookup) => lookup.pids.length === 0)
  if (missingLookup && rejectOnNotFound) {
    throw new Error('No process running on port')
  }

  const allPids = [...new Set(lookups.flatMap((lookup) => lookup.pids))]
  const outcome = killPids(allPids, signal, dryRun)

  return lookups.map((lookup) => ({
    port: lookup.port,
    protocol: lookup.protocol,
    pids: lookup.pids,
    killed: lookup.pids.filter((pid) => outcome.killed.includes(pid)),
    failed: outcome.failed.filter((failure) => lookup.pids.includes(failure.pid))
  }))
}

module.exports = killPort
module.exports.killPort = killPort
module.exports.killPorts = killPorts
module.exports.findPidsForPort = findPidsForPort
module.exports.parsePort = parsePort
module.exports.parsePorts = parsePorts
