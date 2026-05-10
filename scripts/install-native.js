#!/usr/bin/env node
'use strict'

const { copyFileSync, chmodSync, existsSync } = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')

function platformName() {
  const platform = process.platform
  const arch = process.arch

  if (platform === 'darwin' && arch === 'arm64') return 'darwin-arm64'
  if (platform === 'darwin' && arch === 'x64') return 'darwin-x64'
  if (platform === 'linux' && arch === 'x64') return 'linux-x64'
  if (platform === 'linux' && arch === 'arm64') return 'linux-arm64'
  return null
}

function installBinary(platform, sourceName, targetName) {
  const source = path.join(root, 'prebuilds', platform, sourceName)
  const target = path.join(root, 'bin', targetName)

  if (!existsSync(source)) {
    return false
  }

  copyFileSync(source, target)
  chmodSync(target, 0o755)
  return true
}

const platform = platformName()
if (!platform) {
  process.exit(0)
}

installBinary(platform, 'kp-rs', 'kp-native')
installBinary(platform, 'fp-rs', 'fp-native')
