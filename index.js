'use strict'

const { execFile } = require('node:child_process')
const { promisify } = require('node:util')
const { nativeBinaryError, nativeBinaryPath } = require('./native-binary.js')

const execFileAsync = promisify(execFile)

const MAX_PORT = 65535
const DEFAULT_PROTOCOL = 'all'
const DEFAULT_SIGNAL = 'SIGKILL'
const DEFAULT_GRACEFUL_TIMEOUT_MS = 500
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

    for (const part of String(value).split(',')) {
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

function normalizeOptions(options = {}) {
  if (typeof options === 'string') {
    return { method: options }
  }

  if (options && typeof options === 'object' && !Array.isArray(options)) {
    return options
  }

  throw new TypeError('Options must be a protocol string or an options object')
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

function protocolFromOptions(options) {
  const normalizedOptions = normalizeOptions(options)

  if (normalizedOptions.tcpOnly === true && normalizedOptions.udpOnly === true) {
    throw new TypeError('tcpOnly and udpOnly cannot both be true')
  }

  if (normalizedOptions.tcpOnly === true) {
    return 'tcp'
  }

  if (normalizedOptions.udpOnly === true) {
    return 'udp'
  }

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

function normalizeGracefulTimeoutMs(value = DEFAULT_GRACEFUL_TIMEOUT_MS) {
  const timeout = Number(value)
  if (!Number.isSafeInteger(timeout) || timeout < 1) {
    throw new TypeError(`Invalid graceful timeout: ${String(value)}`)
  }

  return timeout
}

function normalizeKillOptions(options, defaultRejectOnNotFound) {
  const normalizedOptions = normalizeOptions(options)

  return {
    protocol: protocolFromOptions(normalizedOptions),
    signal: normalizeSignal(normalizedOptions.signal),
    dryRun: normalizedOptions.dryRun === true,
    force: normalizedOptions.force === true,
    graceful: normalizedOptions.graceful === true,
    gracefulTimeoutMs: normalizeGracefulTimeoutMs(normalizedOptions.gracefulTimeoutMs),
    rejectOnNotFound: normalizedOptions.rejectOnNotFound ?? defaultRejectOnNotFound
  }
}

function protocolArgs(protocol) {
  if (protocol === 'tcp') {
    return ['--tcp-only']
  }

  if (protocol === 'udp') {
    return ['--udp-only']
  }

  return []
}

function nativeArgsForKill(ports, options) {
  const args = ports.map((port) => String(port))
  args.push('--json')
  args.push(...protocolArgs(options.protocol))

  if (options.dryRun) {
    args.push('--dry-run')
  }

  if (options.force) {
    args.push('--force')
  }

  if (options.graceful) {
    args.push('--graceful', '--graceful-timeout', String(options.gracefulTimeoutMs))
  } else if (options.signal !== DEFAULT_SIGNAL) {
    args.push('--signal', String(options.signal))
  }

  return args
}

async function runNativeJson(args) {
  const native = nativeBinaryPath()
  if (!native) {
    throw nativeBinaryError()
  }

  try {
    const result = await execFileAsync(native, args, {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024
    })
    return parseNativeJson(result.stdout)
  } catch (error) {
    const stdout = typeof error?.stdout === 'string' ? error.stdout : ''
    if (stdout.trim().length > 0) {
      return parseNativeJson(stdout)
    }

    const stderr = typeof error?.stderr === 'string' ? error.stderr.trim() : ''
    if (stderr.length > 0) {
      throw new Error(stderr)
    }

    throw error
  }
}

function parseNativeJson(stdout) {
  let payload
  try {
    payload = JSON.parse(stdout)
  } catch (error) {
    throw new Error(`Native binary returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }

  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.results)) {
    throw new Error('Native binary returned an invalid result shape')
  }

  return payload
}

function normalizePortProcess(candidate) {
  if (!candidate || typeof candidate !== 'object') {
    return null
  }

  const pid = Number(candidate.pid)
  const port = Number(candidate.port)
  if (!Number.isSafeInteger(pid) || pid < 1 || !Number.isSafeInteger(port)) {
    return null
  }

  const protocol = normalizeProtocol(candidate.protocol)
  if (protocol === 'all') {
    return null
  }

  const processInfo = { pid, port, protocol }
  if (typeof candidate.command === 'string' && candidate.command.length > 0) {
    processInfo.command = candidate.command
  }

  if (typeof candidate.path === 'string' && candidate.path.length > 0) {
    processInfo.path = candidate.path
  }

  return processInfo
}

function normalizeFailure(candidate) {
  if (!candidate || typeof candidate !== 'object') {
    return null
  }

  const pid = Number(candidate.pid)
  if (!Number.isSafeInteger(pid) || pid < 1) {
    return null
  }

  return {
    pid,
    code: typeof candidate.code === 'string' ? candidate.code : 'ERR_KILL_FAILED',
    message: typeof candidate.message === 'string' ? candidate.message : 'kill failed'
  }
}

function normalizeResult(candidate) {
  if (!candidate || typeof candidate !== 'object') {
    throw new Error('Native binary returned an invalid port result')
  }

  const port = Number(candidate.port)
  if (!Number.isSafeInteger(port)) {
    throw new Error('Native binary returned an invalid port')
  }

  return {
    port,
    protocol: normalizeProtocol(candidate.protocol),
    processes: Array.isArray(candidate.processes)
      ? candidate.processes.map(normalizePortProcess).filter(Boolean)
      : [],
    pids: Array.isArray(candidate.pids) ? normalizePidArray(candidate.pids) : [],
    killed: Array.isArray(candidate.killed) ? normalizePidArray(candidate.killed) : [],
    failed: Array.isArray(candidate.failed)
      ? candidate.failed.map(normalizeFailure).filter(Boolean)
      : [],
    dryRun: candidate.dryRun === true,
    signal: typeof candidate.signal === 'string' || typeof candidate.signal === 'number'
      ? candidate.signal
      : DEFAULT_SIGNAL,
    graceful: candidate.graceful === true
  }
}

function normalizePidArray(values) {
  const pids = []
  for (const value of values) {
    const pid = Number(value)
    if (Number.isSafeInteger(pid) && pid > 0) {
      pids.push(pid)
    }
  }

  return [...new Set(pids)]
}

async function nativeResults(ports, options) {
  const payload = await runNativeJson(nativeArgsForKill(ports, options))
  return payload.results.map(normalizeResult)
}

async function findPortProcesses(portInput, options = {}) {
  const port = parsePort(portInput)
  const protocol = protocolFromOptions(options)
  const [result] = await nativeResults([port], {
    protocol,
    signal: DEFAULT_SIGNAL,
    dryRun: true,
    force: false,
    graceful: false,
    gracefulTimeoutMs: DEFAULT_GRACEFUL_TIMEOUT_MS
  })

  return result ? result.processes : []
}

async function findPidsForPort(portInput, options = {}) {
  const processes = await findPortProcesses(portInput, options)
  return [...new Set(processes.map((processInfo) => processInfo.pid))]
}

async function killPort(portInput, options = {}) {
  const port = parsePort(portInput)
  const normalizedOptions = normalizeKillOptions(options, true)
  const [result] = await nativeResults([port], normalizedOptions)

  if (!result) {
    throw new Error('Native binary returned no result')
  }

  if (result.pids.length === 0 && normalizedOptions.rejectOnNotFound) {
    throw new Error('No process running on port')
  }

  return result
}

async function killPorts(portInputs, options = {}) {
  const ports = parsePorts(portInputs)
  const normalizedOptions = normalizeKillOptions(options, false)
  const results = await nativeResults(ports, normalizedOptions)

  if (normalizedOptions.rejectOnNotFound && results.some((result) => result.pids.length === 0)) {
    throw new Error('No process running on port')
  }

  return results
}

module.exports = killPort
module.exports.killPort = killPort
module.exports.killPorts = killPorts
module.exports.findPortProcesses = findPortProcesses
module.exports.findPidsForPort = findPidsForPort
module.exports.parsePort = parsePort
module.exports.parsePorts = parsePorts
