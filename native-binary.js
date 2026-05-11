'use strict'

const { existsSync } = require('node:fs')
const path = require('node:path')

function isMuslRuntime() {
  if (process.platform !== 'linux') {
    return false
  }

  const report = process.report?.getReport?.()
  return !report?.header?.glibcVersionRuntime
}

function linuxCandidates(arch) {
  const libcCandidates = isMuslRuntime() ? ['musl', 'gnu'] : ['gnu', 'musl']
  return [
    ...libcCandidates.map((libc) => `linux-${arch}-${libc}`),
    `linux-${arch}`
  ]
}

function platformCandidates() {
  const platform = process.platform
  const arch = process.arch

  if (platform === 'darwin' && arch === 'arm64') {
    return ['darwin-arm64']
  }

  if (platform === 'darwin' && arch === 'x64') {
    return ['darwin-x64']
  }

  if (platform === 'linux' && arch === 'x64') {
    return linuxCandidates('x64')
  }

  if (platform === 'linux' && arch === 'arm64') {
    return linuxCandidates('arm64')
  }

  if (platform === 'win32' && arch === 'x64') {
    return ['windows-x64-msvc']
  }

  if (platform === 'win32' && arch === 'arm64') {
    return ['windows-arm64-msvc']
  }

  return []
}

function binaryName() {
  return process.platform === 'win32' ? 'kp-rs.exe' : 'kp-rs'
}

function candidatePaths(rootDirectory = __dirname) {
  const name = binaryName()
  const candidates = platformCandidates().flatMap((platform) => [
    path.join(rootDirectory, 'native', 'prebuilds', platform, name)
  ])

  candidates.push(path.join(rootDirectory, 'native', 'target', 'release', name))
  candidates.push(path.join(rootDirectory, 'native', 'target', 'debug', name))

  return candidates
}

function nativeBinaryPath(rootDirectory = __dirname) {
  for (const candidate of candidatePaths(rootDirectory)) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  return null
}

function nativeTargetLabel() {
  return platformCandidates()[0] ?? `${process.platform}-${process.arch}`
}

function nativeBinaryError() {
  return new Error(
    `kill-port-now native binary not found for ${nativeTargetLabel()}. ` +
    'Reinstall the package or report a broken release.'
  )
}

module.exports = {
  nativeBinaryPath,
  nativeBinaryError,
  nativeTargetLabel
}
