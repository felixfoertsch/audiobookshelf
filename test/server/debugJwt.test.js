const assert = require('node:assert/strict')
const sinon = require('sinon')
const passport = require('passport')
const { Strategy, ExtractJwt } = require('passport-jwt')
const express = require('express')
const http = require('node:http')
const jwt = require('../../server/libs/jsonwebtoken')
const Server = require('../../server/Server')
const Database = require('../../server/Database')
// Load verifier after ABS module graph settles; early scanner tests exercise its circular imports.
const tokenManagerPath = require.resolve('../../server/auth/TokenManager')
const Auth = require('../../server/Auth')
const createDebugHost = require('../../server/utils/debugHost')
const { fetch } = globalThis

describe('debug native JWT boundary', () => {
  it('checks JWT signature before fresh DB role for every method, including revocation behind cached identity', async () => {
    const cachedModule = require.cache[tokenManagerPath]
    delete require.cache[tokenManagerPath]
    const TokenManager = require(tokenManagerPath)
    const cachedUser = { id: 'admin', type: 'root', isActive: true }
    const userModel = { getUserByIdOrOldId: async () => cachedUser }
    sinon.stub(Database, 'userModel').get(() => userModel)
    const secret = 'disposable-debug-jwt-test-secret'
    passport.use(new Strategy({ jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), secretOrKey: secret, ignoreExpiration: true }, TokenManager.prototype.jwtAuthCheck.bind({})))
    let current = { type: 'admin', isActive: true }
    const gate = createDebugHost({ userModel: { findByPk: async () => current } })
    const app = express()
    app.use(passport.initialize())
    app.use('/api/debug', Server.prototype.authMiddleware.bind({ auth: { isAuthenticated: Auth.prototype.isAuthenticated } }), gate.authorize, (req, res) => res.json({ ok: true }))
    const server = http.createServer(app)
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const token = jwt.sign({ userId: 'admin', type: 'access', exp: Math.floor(Date.now() / 1000) + 60 }, secret)
    try {
      for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']) {
        const send = (credential) => fetch(`http://127.0.0.1:${server.address().port}/api/debug/notes/item/book`, { method, headers: credential ? { authorization: `Bearer ${credential}` } : {} })
        assert.equal((await send()).status, 401)
        assert.equal((await send(`${token}invalid`)).status, 401)
        current = { type: 'admin', isActive: true }
        assert.equal((await send(token)).status, 200)
        current = { type: 'user', isActive: true }
        assert.equal((await send(token)).status, 403)
        current = { type: 'root', isActive: false }
        assert.equal((await send(token)).status, 403)
      }
    } finally {
      await new Promise((resolve) => server.close(resolve))
      passport.unuse('jwt')
      sinon.restore()
      if (cachedModule) require.cache[tokenManagerPath] = cachedModule
    }
  })
})
