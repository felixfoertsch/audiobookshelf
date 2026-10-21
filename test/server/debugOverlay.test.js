const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const Path = require('node:path')
const express = require('express')
const http = require('node:http')
const { fetch } = globalThis
const createDebugOverlay = require('../../server/utils/debugOverlay')

describe('debug overlay adapter', () => {
  it('persists notes across close/reopen and fails closed without affecting health', async () => {
    const dir = fs.mkdtempSync(Path.join(os.tmpdir(), 'abs-debug-'))
    let active = true
    const database = { userModel: { findByPk: async () => ({ type: 'admin', isActive: active }) } }
    async function start(config) {
      const middleware = createDebugOverlay(database, config)
      const app = express()
      app.get('/health', (req, res) => res.send('ok'))
      app.use(express.json())
      app.use('/api/debug', (req, res, next) => { req.user = { id: 'admin' }; next() }, middleware)
      const server = http.createServer(app)
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
      return {
        url: `http://127.0.0.1:${server.address().port}`,
        close: async () => { await new Promise((resolve) => server.close(resolve)); middleware.close() }
      }
    }
    let fixture = await start(dir)
    try {
      active = false
      assert.equal((await fetch(`${fixture.url}/api/debug/notes/item/book`, { method: 'PUT', body: '{"note":"denied"}', headers: { 'content-type': 'application/json' } })).status, 403)
      assert.equal(fs.existsSync(Path.join(dir, 'debug-overlay.sqlite')), false)
      active = true
      const saved = await fetch(`${fixture.url}/api/debug/notes/item/book`, { method: 'PUT', body: '{"note":"persisted"}', headers: { 'content-type': 'application/json' } })
      assert.equal(saved.status, 200)
      await fixture.close()
      fixture = await start(dir)
      assert.equal((await (await fetch(`${fixture.url}/api/debug/notes/item/book`)).json()).note, 'persisted')
      await fixture.close()
      const blocked = Path.join(dir, 'blocked')
      fs.writeFileSync(blocked, 'not a directory')
      fixture = await start(blocked)
      assert.equal((await fetch(`${fixture.url}/api/debug/notes/item/book`)).status, 503)
      assert.equal((await fetch(`${fixture.url}/health`)).status, 200)
    } finally {
      await fixture.close()
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
