const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const Path = require('node:path')
const http = require('node:http')
const express = require('express')
const createModernWeb = require('../../server/utils/modernWeb')

describe('modern web preview', () => {
  let dir, server, origin
  before(async () => {
    dir = fs.mkdtempSync(Path.join(os.tmpdir(), 'abs-modern-web-'))
    fs.mkdirSync(Path.join(dir, 'assets'))
    fs.mkdirSync(Path.join(dir, 'icons'))
    fs.writeFileSync(Path.join(dir, 'manifest.webmanifest'), JSON.stringify({ id: './', start_url: './', scope: './', display: 'standalone', icons: [{ src: './icons/icon.svg', sizes: 'any', type: 'image/svg+xml' }] }))
    fs.writeFileSync(Path.join(dir, 'icons/icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
    fs.writeFileSync(Path.join(dir, 'index.html'), '<!doctype html><html><head><title>Preview</title></head><body><script type="module" src="./assets/app-12345678.js"></script></body></html>')
    fs.writeFileSync(Path.join(dir, 'assets/app-12345678.js'), 'console.log("preview")')
    fs.mkdirSync(Path.join(dir, 'api'))
    fs.writeFileSync(Path.join(dir, 'api/test'), 'must not serve')
    const app = express()
    // Same rewrite and originalHostPrefix semantics as Server.start().
    app.use((req, res, next) => {
      const prefix = req.url.startsWith('/abs') ? '/abs' : ''
      req.originalHostPrefix = `http://localhost${prefix}`
      if (!prefix) req.url = `/abs${req.url}`
      next()
    })
    const router = express.Router()
    app.use('/abs', router)
    router.use('/new', createModernWeb(dir))
    router.use('/missing/new', createModernWeb(Path.join(dir, 'absent')))
    router.get(['/api/test', '/auth/test', '/hls/test', '/public/test', '/feed/test', '/socket.io/test'], (req, res) => res.send('backend'))
    router.get(['/', '/item/:id'], (req, res) => res.send('classic'))
    server = http.createServer(app)
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    origin = `http://127.0.0.1:${server.address().port}`
  })
  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve))
    if (dir) fs.rmSync(dir, { recursive: true, force: true })
  })
  async function get(path) { return fetch(`${origin}${path}`) }
  for (const prefix of ['', '/abs']) {
    it(`serves deep links with actual runtime prefix ${prefix || '(root)'}`, async () => {
      const response = await get(`${prefix}/new/library/podcast`)
      assert.equal(response.status, 200)
      assert.equal(response.headers.get('cache-control'), 'no-store')
      const html = await response.text()
      assert.ok(html.includes(`<base href="${prefix}/new/">`))
      assert.ok(html.includes(`window.__ABS_WEB_CONFIG__=${JSON.stringify({ basePath: `${prefix}/new`, apiBasePath: prefix })}`))
    })
    it(`serves uncached native manifest and icons scoped by relative URLs ${prefix || '(root)'}`, async () => {
      const response = await get(`${prefix}/new/manifest.webmanifest`)
      assert.equal(response.status, 200)
      assert.match(response.headers.get('content-type'), /manifest\+json/)
      assert.equal(response.headers.get('cache-control'), 'no-store')
      const manifest = await response.json()
      const url = `${origin}${prefix}/new/manifest.webmanifest`
      for (const field of ['id', 'start_url', 'scope']) assert.equal(new URL(manifest[field], url).pathname, `${prefix}/new/`)
      const icon = await get(`${prefix}/new/icons/icon.svg`)
      assert.equal(icon.status, 200)
      assert.match(icon.headers.get('content-type'), /image\/svg\+xml/)
      assert.equal(icon.headers.get('cache-control'), 'no-store')
    })
    it(`serves dotted canonical share slugs ${prefix || '(root)'}`, async () => {
      for (const slug of ['foo.bar', 'missing.js', 'foo%2Ebar']) {
        const response = await get(`${prefix}/new/share/${slug}`)
        assert.equal(response.status, 200)
        assert.equal(response.headers.get('cache-control'), 'no-store')
        const html = await response.text()
        assert.ok(html.includes(`<base href="${prefix}/new/">`))
        assert.ok(html.includes(`window.__ABS_WEB_CONFIG__=${JSON.stringify({ basePath: `${prefix}/new`, apiBasePath: prefix })}`))
      }
      assert.equal((await get(`${prefix}/new/assets/missing.js`)).status, 404)
      assert.equal((await get(`${prefix}/new/share/foo.bar/missing.js`)).status, 404)
    })
    it(`keeps classic and backend routes unchanged ${prefix || '(root)'}`, async () => {
      for (const route of ['/', '/item/book']) assert.equal(await (await get(`${prefix}${route}`)).text(), 'classic')
      for (const route of ['api', 'auth', 'hls', 'public', 'feed', 'socket.io']) {
        assert.equal(await (await get(`${prefix}/${route}/test`)).text(), 'backend')
        assert.equal((await get(`${prefix}/new/${route}/test`)).status, 404)
      }
    })
  }
  it('serves hashed assets with immutable caching, but never SPA HTML for missing files', async () => {
    const response = await get('/new/assets/app-12345678.js')
    assert.equal(response.status, 200)
    assert.match(response.headers.get('cache-control'), /immutable/)
    for (const path of ['/new/assets/missing', '/new/missing.js', '/new/missing%2Ejs', '/new/%61pi/test', '/new/favicon.ico', '/missing/new/deep']) {
      const missing = await get(path)
      assert.equal(missing.status, 404)
      assert.ok(!(await missing.text()).includes('<title>Preview</title>'))
    }
  })
  for (const enabled of [false, true]) {
    it(`selects alpha landing only when enabled (${enabled}), preserves Classic and transports`, async () => {
      const app = express()
      app.use((req, res, next) => {
        const prefix = /^\/abs(?:\/|\?|$)/.test(req.url) ? '/abs' : ''
        req.originalHostPrefix = `http://localhost${prefix}`
        if (prefix) req.url = req.url.slice(prefix.length).replace(/^(?=\?|$)/, '/')
        next()
      })
      app.get('/', createModernWeb.defaultLanding(dir, enabled))
      app.get(['/', '/library/:id', '/login', '/api/test', '/auth/test', '/hls/test', '/public/test', '/feed/test', '/socket.io/test'], (req, res) => res.send('classic or backend'))
      const landingServer = app.listen(0, '127.0.0.1')
      await new Promise((resolve) => landingServer.once('listening', resolve))
      const base = `http://127.0.0.1:${landingServer.address().port}`
      try {
        for (const prefix of ['', '/abs']) {
          for (const root of [prefix || '/', `${prefix}/`]) {
            const response = await fetch(`${base}${root}?source=one%26two&next=%2Flibrary%2Fbook`, { redirect: 'manual' })
            assert.equal(response.status, enabled ? 302 : 200)
            if (enabled) {
              assert.equal(response.headers.get('location'), `${prefix}/new/?source=one%26two&next=%2Flibrary%2Fbook`)
              assert.equal(response.headers.get('cache-control'), 'no-store')
            }
          }
          for (const route of ['/?classic=1', '/library/book', '/login', '/api/test', '/auth/test', '/hls/test', '/public/test', '/feed/test', '/socket.io/test']) {
            const response = await fetch(`${base}${prefix}${route}`, { redirect: 'manual' })
            assert.equal(response.status, 200)
            assert.equal(await response.text(), 'classic or backend')
          }
          assert.equal((await fetch(`${base}${prefix}/`, { method: 'POST', redirect: 'manual' })).status, 404)
          assert.equal((await fetch(`${base}${prefix}/`, { method: 'HEAD', redirect: 'manual' })).status, enabled ? 302 : 200)
        }
      } finally { await new Promise((resolve) => landingServer.close(resolve)) }
    })
  }
  it('falls back to Classic landing when alpha build is absent', async () => {
    const app = express()
    app.get('/', createModernWeb.defaultLanding(Path.join(dir, 'absent'), true))
    app.get('/', (req, res) => res.send('classic'))
    const missingServer = app.listen(0, '127.0.0.1')
    await new Promise((resolve) => missingServer.once('listening', resolve))
    try {
      const response = await fetch(`http://127.0.0.1:${missingServer.address().port}/`, { redirect: 'manual' })
      assert.equal(response.status, 200)
      assert.equal(await response.text(), 'classic')
    } finally { await new Promise((resolve) => missingServer.close(resolve)) }
  })
  it('rejects untrusted script-bearing prefix instead of reflecting it', async () => {
    const app = express()
    app.use((req, res, next) => { req.originalHostPrefix = 'http://localhost/</script><script>alert(1)</script>'; next() })
    app.use('/new', createModernWeb(dir))
    const unsafeServer = app.listen(0, '127.0.0.1')
    await new Promise((resolve) => unsafeServer.once('listening', resolve))
    try {
      const response = await fetch(`http://127.0.0.1:${unsafeServer.address().port}/new/`)
      assert.equal(response.status, 400)
      assert.ok(!(await response.text()).includes('<script>'))
    } finally { await new Promise((resolve) => unsafeServer.close(resolve)) }
  })
})
