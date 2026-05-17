'use strict'

const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const { existsSync, mkdtempSync, rmSync } = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { nativeTargetLabel } = require('../native-binary.js')

const rootDirectory = path.join(__dirname, '..')
const packedInstallTargets = new Set([
  'darwin-arm64',
  'darwin-x64',
  'linux-x64-gnu'
])

const currentTarget = nativeTargetLabel()
const supportsPackedInstall = packedInstallTargets.has(currentTarget)
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

function packArchive(tempDirectory) {
  const output = execFileSync(
    npmCommand,
    ['pack', '--silent', '--pack-destination', tempDirectory],
    { cwd: rootDirectory, encoding: 'utf8' }
  )

  const archiveName = output.trim().split(/\r?\n/).pop()
  assert.ok(archiveName, 'npm pack should print the created archive name')
  return path.join(tempDirectory, archiveName)
}

function installedPackagePath(prefixDirectory) {
  return path.join(prefixDirectory, 'lib', 'node_modules', 'kill-port-now')
}

test('packed install includes a runnable native binary for this platform', {
  skip: supportsPackedInstall ? false : `${currentTarget} does not have a committed prebuild yet`
}, () => {
  const tempDirectory = mkdtempSync(path.join(os.tmpdir(), 'kp-packed-install-'))

  try {
    const archivePath = packArchive(tempDirectory)
    const prefixDirectory = path.join(tempDirectory, 'prefix')

    execFileSync(
      npmCommand,
      ['install', '--global', '--prefix', prefixDirectory, archivePath, '--silent'],
      { encoding: 'utf8' }
    )

    const packagePath = installedPackagePath(prefixDirectory)
    const binaryName = process.platform === 'win32' ? 'kp-rs.exe' : 'kp-rs'
    const nativePath = path.join(packagePath, 'native', 'prebuilds', currentTarget, binaryName)
    assert.equal(existsSync(nativePath), true, `missing packed native binary at ${nativePath}`)

    const kpPath = path.join(prefixDirectory, 'bin', 'kp')
    const output = execFileSync(kpPath, ['--help'], { encoding: 'utf8' })
    assert.match(output, /Usage:/)
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true })
  }
})
