'use strict'

const net = require('node:net')

const server = net.createServer((socket) => {
  socket.end()
})

server.listen(0, '127.0.0.1', () => {
  const address = server.address()
  if (address && typeof address === 'object' && process.send) {
    process.send({ port: address.port })
  }
})

process.on('SIGTERM', () => {
  // Intentionally keep the process alive so graceful mode must escalate to SIGKILL.
})
