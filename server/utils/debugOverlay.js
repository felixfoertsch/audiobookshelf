const Path = require('path')
const createDebugHost = require('./debugHost')

module.exports = function createDebugOverlay(database, configPath) {
  const host = createDebugHost(database)
  let adapter
  try {
    adapter = require('debug-overlay/express').createDebugMiddleware({
      dbPath: Path.join(configPath, 'debug-overlay.sqlite'),
      authorize: () => true,
      routes: (req) => host.getPaths(req.user)
    })
  } catch {
    // Debug tooling must not prevent the native server from starting.
  }
  const middleware = (req, res, next) => host.authorize(req, res, () => {
    if (!adapter) return res.status(503).send('Debug storage unavailable')
    Promise.resolve(adapter(req, res, (error) => {
      if (error) {
        if (res.headersSent) return next(error)
        return res.status(503).send('Debug storage unavailable')
      }
      next()
    })).catch(() => {
      if (!res.headersSent) res.status(503).send('Debug storage unavailable')
    })
  })
  middleware.close = () => adapter?.close()
  return middleware
}
