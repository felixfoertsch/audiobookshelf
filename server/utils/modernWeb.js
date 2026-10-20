const express = require('express')
const fs = require('node:fs/promises')
const Path = require('node:path')

// Mounted after the backend routes, before either existing client. Missing builds
// stay local to /new: API and classic UI must still start without web/dist.
module.exports = function createModernWeb(distPath) {
  const router = express.Router()
  const staticFiles = express.static(distPath, {
    index: false,
    redirect: false,
    setHeaders(res, filePath) {
      const hashedAsset = Path.dirname(filePath) === Path.join(distPath, 'assets') && /-[a-zA-Z0-9_-]{8,}\.[a-z0-9]+$/.test(filePath)
      res.setHeader('Cache-Control', hashedAsset ? 'public, max-age=31536000, immutable' : 'no-store')
    }
  })
  router.use((req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method)) return res.sendStatus(404)
    // Reserved backend namespaces must not be served even if present in dist.
    let pathname
    try { pathname = decodeURIComponent(req.path) } catch { return res.sendStatus(400) }
    if (/^\/(api|auth|hls|public|feed|socket|socket\.io|internal-api)(\/|$)/i.test(pathname)) return res.sendStatus(404)
    return pathname === '/index.html' ? next() : staticFiles(req, res, next)
  })
  router.use(async (req, res, next) => {
    // Never substitute HTML for missing assets, even extensionless assets.
    const pathname = decodeURIComponent(req.path)
    // Share slugs are arbitrary nonempty segments, including file-like names.
    const canonicalShare = /^\/share\/[^/]+\/?$/.test(pathname)
    if (/^\/assets(\/|$)/i.test(pathname) || (!canonicalShare && pathname !== '/index.html' && Path.posix.basename(pathname).includes('.'))) return res.sendStatus(404)
    let apiBasePath
    try {
      // Server's rewrite permits both direct root and configured-prefix access.
      // req.baseUrl alone is wrong for direct root requests after that rewrite.
      apiBasePath = new URL(req.originalHostPrefix).pathname.replace(/\/$/, '')
      if (!/^(\/[-a-zA-Z0-9._~]+)*$/.test(apiBasePath)) return res.sendStatus(400)
    } catch {
      return res.sendStatus(400)
    }
    const basePath = `${apiBasePath}/new`
    const config = JSON.stringify({ basePath, apiBasePath }).replace(/[<>&\u2028\u2029]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`)
    try {
      const html = await fs.readFile(Path.join(distPath, 'index.html'), 'utf8')
      const runtime = `<base href="${basePath}/"><script>window.__ABS_WEB_CONFIG__=${config}</script>`
      res.setHeader('Cache-Control', 'no-store')
      res.type('html').send(html.replace('<head>', `<head>${runtime}`))
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return res.sendStatus(404)
      next(error)
    }
  })
  return router
}

// Only the landing page changes. Classic keeps its native routes and transports.
module.exports.defaultLanding = function defaultLanding(distPath, enabled) {
  return async (req, res, next) => {
    if (!enabled || req.query.classic === '1') return next()
    try {
      await fs.access(Path.join(distPath, 'index.html'))
      const prefix = new URL(req.originalHostPrefix).pathname.replace(/\/$/, '')
      if (!/^(\/[-a-zA-Z0-9._~]+)*$/.test(prefix)) return res.sendStatus(400)
      const search = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : ''
      res.setHeader('Cache-Control', 'no-store')
      res.redirect(302, `${prefix}/new/${search}`)
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return next()
      next(error)
    }
  }
}
