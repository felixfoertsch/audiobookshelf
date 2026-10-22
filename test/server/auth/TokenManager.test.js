const { expect } = require('chai')
const sinon = require('sinon')
const { Op } = require('sequelize')

const Database = require('../../../server/Database')
const jwt = require('../../../server/libs/jsonwebtoken')

// Database → Auth → TokenManager circular require can leave TokenManager with a partial Database reference; reload before each test
function loadTokenManager() {
  delete require.cache[require.resolve('../../../server/auth/TokenManager')]
  return require('../../../server/auth/TokenManager')
}

describe('TokenManager', () => {
  const secret = 'test-jwt-secret'
  const userId = 'user-uuid-1'
  let TokenManager
  let tokenManager

  beforeEach(() => {
    TokenManager = loadTokenManager()
    TokenManager.TokenSecret = secret
    tokenManager = new TokenManager()
  })

  afterEach(() => {
    sinon.restore()
  })

  describe('validateAccessToken', () => {
    it('accepts access tokens', () => {
      const accessToken = jwt.sign({ userId, type: 'access' }, secret, { expiresIn: 3600 })
      const decoded = TokenManager.validateAccessToken(accessToken)
      expect(decoded.userId).to.equal(userId)
      expect(decoded.type).to.equal('access')
    })
  })

  describe('jwtAuthCheck', () => {
    const user = { id: userId, username: 'testuser', isActive: true }

    it('rejects refresh tokens for API auth', async () => {
      const refreshToken = tokenManager.generateRefreshToken(user)
      const decoded = jwt.verify(refreshToken, secret)
      const done = sinon.spy()

      await tokenManager.jwtAuthCheck(decoded, done)

      expect(done.calledWith(null, null)).to.be.true
    })

    it('allows access tokens for active users', async () => {
      sinon.stub(Database, 'userModel').get(() => ({
        getUserByIdOrOldId: sinon.stub().resolves(user)
      }))
      const decoded = jwt.verify(tokenManager.generateTempAccessToken(user), secret)
      const done = sinon.spy()

      await tokenManager.jwtAuthCheck(decoded, done)

      expect(done.calledWith(null, user)).to.be.true
    })
  })

  describe('30-day sliding sessions', () => {
    const user = { id: userId, username: 'testuser', isActive: true }
    const day = 24 * 60 * 60 * 1000
    let clock
    let sessions
    let req
    let res

    beforeEach(() => {
      clock = sinon.useFakeTimers({ now: Date.parse('2026-01-01T00:00:00Z'), toFake: ['Date'] })
      sessions = new Map()
      req = { headers: {}, get: () => 'https' }
      res = { cookie: sinon.spy() }
      sinon.stub(Database, 'userModel').get(() => ({ getUserById: async () => user }))
      sinon.stub(Database, 'sessionModel').get(() => ({
        createSession: async (id, ipAddress, userAgent, refreshToken, expiresAt) => {
          const session = { id: 'session', userId: id, refreshToken, expiresAt }
          sessions.set(session.id, session)
          return { ...session }
        },
        findOne: async ({ where }) => {
          const session = [...sessions.values()].find((row) => where.id
            ? row.id === where.id
            : where[Op.or].some((condition) => Object.entries(condition).every(([key, value]) => row[key] === value)))
          return session ? { ...session } : null
        },
        update: async (values, { where }) => {
          const session = sessions.get(where.id)
          if (!session || session.refreshToken !== where.refreshToken) return [0]
          Object.assign(session, values)
          return [1]
        },
        destroy: async ({ where }) => {
          let count = 0
          for (const [id, session] of sessions) {
            if (session.refreshToken === where.refreshToken) {
              sessions.delete(id)
              count++
            }
          }
          return count
        }
      }))
    })

    it('keeps an idle session for 30 days, slides JWT, database and persistent cookie on refresh', async () => {
      expect(tokenManager.RefreshTokenExpiry).to.equal(30 * day / 1000)
      expect(tokenManager.AccessTokenExpiry).to.equal(3600)
      const initial = await tokenManager.createTokensAndSession(user, req)
      tokenManager.setRefreshTokenCookie(req, res, initial.refreshToken)
      expect(res.cookie.lastCall.args[2]).to.deep.equal({
        httpOnly: true, secure: true, sameSite: 'lax', maxAge: 30 * day, path: '/'
      })

      clock.tick(29 * day)
      const refreshed = await tokenManager.handleRefreshToken(initial.refreshToken, req, res)
      expect(refreshed.error).to.equal(undefined)
      expect(refreshed.refreshToken).not.to.equal(initial.refreshToken)
      expect(jwt.verify(refreshed.refreshToken, secret).exp * 1000).to.equal(Date.now() + 30 * day)
      expect(sessions.get('session').expiresAt.getTime()).to.equal(Date.now() + 30 * day)
      expect(res.cookie.lastCall.args[2].maxAge).to.equal(30 * day)
      expect(jwt.verify(refreshed.accessToken, secret).exp * 1000).to.equal(Date.now() + 3600000)

      clock.tick(29 * day)
      const again = await tokenManager.handleRefreshToken(refreshed.refreshToken, req, res)
      expect(again.error).to.equal(undefined)
      await tokenManager.invalidateRefreshToken(again.refreshToken)
      expect((await tokenManager.handleRefreshToken(again.refreshToken, req, res)).error).to.equal('Invalid refresh token')
    })

    it('expires an idle session at 30 days', async () => {
      const initial = await tokenManager.createTokensAndSession(user, req)
      clock.tick(30 * day)
      expect((await tokenManager.handleRefreshToken(initial.refreshToken, req, res)).error).to.equal('Refresh token expired')
      expect(sessions.size).to.equal(0)
    })

    it('returns the same rotated token for concurrent requests and grace-period retries', async () => {
      const initial = await tokenManager.createTokensAndSession(user, req)
      clock.tick(day)
      const [first, second] = await Promise.all([
        tokenManager.handleRefreshToken(initial.refreshToken, req, res),
        tokenManager.handleRefreshToken(initial.refreshToken, req, res)
      ])
      expect(first.error).to.equal(undefined)
      expect(second.refreshToken).to.equal(first.refreshToken)
      const retry = await tokenManager.handleRefreshToken(initial.refreshToken, req, res)
      expect(retry.refreshToken).to.equal(first.refreshToken)
    })
  })

  describe('invalidateJwtSessionsForUser', () => {
    const targetUser = { id: userId, username: 'testuser' }
    const currentSession = {
      id: 'session-current',
      userId,
      refreshToken: 'refresh-current'
    }

    /** Minimal req/res for session invalidation (ApiRouter provides auth on real requests). */
    function makeReq({ requestUserId = userId, refreshToken = null, cookieRefreshToken = null } = {}) {
      return {
        user: { id: requestUserId },
        cookies: cookieRefreshToken ? { refresh_token: cookieRefreshToken } : {},
        headers: refreshToken ? { 'x-refresh-token': refreshToken } : {}
      }
    }

    let sessionFindOne
    let sessionDestroy
    let rotateStub

    beforeEach(() => {
      sessionFindOne = sinon.stub().resolves(currentSession)
      sessionDestroy = sinon.stub().resolves(1)
      sinon.stub(Database, 'sessionModel').get(() => ({
        findOne: sessionFindOne,
        destroy: sessionDestroy
      }))
      rotateStub = sinon.stub(tokenManager, 'rotateTokensForSession').resolves({
        accessToken: 'access-new',
        refreshToken: 'refresh-new'
      })
    })

    it('self password change: keeps current session, deletes others', async () => {
      const req = makeReq({ refreshToken: 'refresh-current' })
      const res = { cookie: sinon.spy() }

      const result = await tokenManager.invalidateJwtSessionsForUser(targetUser, req, res)

      // Found this device's session using the x-refresh-token header
      expect(sessionFindOne.calledOnce).to.be.true
      const findWhere = sessionFindOne.firstCall.args[0].where
      expect(findWhere.userId).to.equal(userId)
      expect(findWhere[Op.or]).to.deep.equal([{ refreshToken: 'refresh-current' }, { lastRefreshToken: 'refresh-current' }])

      // Rotated in place (no grace period) so the caller keeps a valid session
      expect(rotateStub.calledOnceWith(currentSession, targetUser, req, res, false)).to.be.true

      // Deleted all other sessions, but not this one
      expect(sessionDestroy.calledOnce).to.be.true
      const destroyWhere = sessionDestroy.firstCall.args[0].where
      expect(destroyWhere.userId).to.equal(userId)
      expect(destroyWhere.id[Op.ne]).to.equal(currentSession.id)

      expect(result).to.deep.equal({ accessToken: 'access-new', refreshToken: 'refresh-new' })
    })

    it('admin password reset: deletes all target sessions', async () => {
      const req = makeReq({ requestUserId: 'admin-id', refreshToken: 'refresh-current' })
      const res = { cookie: sinon.spy() }

      const result = await tokenManager.invalidateJwtSessionsForUser(targetUser, req, res)

      // Token rotation did not happen because target is a different user
      expect(sessionFindOne.called).to.be.false
      expect(rotateStub.called).to.be.false

      expect(sessionDestroy.calledOnceWith(sinon.match({ where: { userId } }))).to.be.true
      expect(result).to.equal(null)
    })
  })
})
