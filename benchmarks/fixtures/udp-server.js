'use strict'

const dgram = require('node:dgram')

const socket = dgram.createSocket('udp4')

socket.bind(0, '127.0.0.1', () => {
  const address = socket.address()
  if (process.send) {
    process.send({ port: address.port })
  }
})

process.on('SIGTERM', () => {
  socket.close(() => {
    process.exit(0)
  })
})
