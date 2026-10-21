const assert = require('node:assert/strict')
const sinon = require('sinon')
const Server = require('../../server/Server')
const Watcher = require('../../server/Watcher')
const SocketAuthority = require('../../server/SocketAuthority')
const { setImmediate } = require('node:timers')

describe('debug shutdown', () => {
  it('waits for HTTP drain before closing debug SQLite', async () => {
    sinon.stub(Watcher, 'close')
    sinon.stub(SocketAuthority, 'close').resolves()
    const events = []
    let drain
    const owner = {
      server: { close(callback) { events.push('http-close'); drain = callback } },
      debugOverlay: { close() { events.push('debug-close') } }
    }
    try {
      const stopped = Server.prototype.stop.call(owner)
      await new Promise((resolve) => setImmediate(resolve))
      assert.deepEqual(events, ['http-close'])
      drain()
      await stopped
      assert.deepEqual(events, ['http-close', 'debug-close'])
    } finally {
      sinon.restore()
    }
  })
})
