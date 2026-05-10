#!/usr/bin/env node
'use strict'

const { spawnSync } = require('node:child_process')

const ITERATIONS = Number(process.env.ITERATIONS || 3)
const PORT = Number(process.env.PORT || 65535)

function run(command, args) {
  const start = process.hrtime.bigint()
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  })
  const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000

  if (result.error && result.error.code === 'ENOENT') {
    throw new Error(`${command} not found`)
  }

  return durationMs
}

function measure(label, command, args) {
  const samples = []
  for (let index = 0; index < ITERATIONS; index += 1) {
    samples.push(run(command, args))
  }

  samples.sort((left, right) => left - right)
  const total = samples.reduce((sum, sample) => sum + sample, 0)
  const mean = total / samples.length
  const median = samples[Math.floor(samples.length / 2)]
  const min = samples[0]
  const max = samples[samples.length - 1]

  return { label, mean, median, min, max }
}

function print(row) {
  console.log(`${row.label.padEnd(28)} mean ${row.mean.toFixed(2).padStart(7)} ms  median ${row.median.toFixed(2).padStart(7)} ms  min ${row.min.toFixed(2).padStart(7)} ms  max ${row.max.toFixed(2).padStart(7)} ms`)
}

console.log(`Port: ${PORT}`)
console.log(`Iterations: ${ITERATIONS}`)
console.log('')

const oldLookup = measure('kill-port lookup path', 'lsof', ['-i', '-P'])
const newLookup = measure('kill-port-now lookup', 'lsof', ['-nP', '-t', `-iTCP:${PORT}`, '-sTCP:LISTEN'])

print(oldLookup)
print(newLookup)
console.log('')
console.log(`Approx speedup: ${(oldLookup.mean / newLookup.mean).toFixed(1)}x`)
