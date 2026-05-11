#!/usr/bin/env node
'use strict'

const { spawn } = require('node:child_process')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const { nativeBinaryError, nativeBinaryPath } = require('../native-binary.js')

function packageVersion() {
  const packageJsonPath = path.join(__dirname, '..', 'package.json')
  return JSON.parse(readFileSync(packageJsonPath, 'utf8')).version
}

function main() {
  const args = process.argv.slice(2)
  if (args.includes('--version')) {
    console.log(packageVersion())
    return
  }

  const native = nativeBinaryPath(path.join(__dirname, '..'))
  if (!native) {
    console.error(nativeBinaryError().message)
    process.exitCode = 1
    return
  }

  const child = spawn(native, args, { stdio: 'inherit' })
  child.on('error', (error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
  child.on('exit', (code, signal) => {
    if (typeof code === 'number') {
      process.exitCode = code
      return
    }

    if (signal) {
      console.error(`native binary exited with signal ${signal}`)
      process.exitCode = 1
    }
  })
}

main()
