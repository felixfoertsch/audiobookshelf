const { expect } = require('chai')
const sinon = require('sinon')
const controller = require('../../../server/controllers/PodcastController')
const Database = require('../../../server/Database')
const manager = require('../../../server/managers/AdAnalysisManager')

describe('Podcast ad analysis authorization', () => {
  afterEach(() => sinon.restore())
  const response = () => ({ code: null, body: null, sendStatus(code) { this.code = code; return this }, status(code) { this.code = code; return this }, send(body) { this.body = body; return this }, json(body) { this.body = body; return this } })
  it('blocks inaccessible reads and writes before handlers', async () => {
    sinon.stub(Database, 'libraryItemModel').get(() => ({ getExpandedById: async () => ({ isPodcast: true, media: {} }) }))
    for (const method of ['GET', 'POST']) {
      const res = response()
      const next = sinon.spy()
      await controller.middleware({ method, params: { id: 'item' }, user: { checkCanAccessLibraryItem: () => false } }, res, next)
      expect(res.code).to.equal(403)
      expect(next.called).to.equal(false)
    }
  })
  it('rejects nonadmin consent and arbitrary request fields', async () => {
    const save = sinon.spy()
    const item = { extraData: { retained: 1 }, save }
    const res = response()
    await controller.setAdAnalysis({ user: { isAdminOrUp: false }, body: { enabled: true }, libraryItem: item }, res)
    expect(res.code).to.equal(403)
    await controller.setAdAnalysis({ user: { isAdminOrUp: true }, body: { enabled: true, url: 'http://example.org' }, libraryItem: item }, res)
    expect(res.code).to.equal(400)
    expect(save.called).to.equal(false)
    await controller.setAdAnalysis({ user: { isAdminOrUp: true }, body: { enabled: true }, libraryItem: item }, res)
    expect(item.extraData).to.deep.equal({ retained: 1, adAnalysisEnabled: true })
    expect(save.calledOnce).to.equal(true)
  })
  it('requires consent, admin, known empty body; reads never enqueue', async () => {
    const enqueue = sinon.stub(manager, 'enqueue').returns(true)
    const episode = { id: 'episode', toOldJSON: () => ({ id: 'episode' }) }
    const item = { extraData: {}, media: { podcastEpisodes: [episode] } }
    const req = { user: { isAdminOrUp: true }, params: { episodeId: 'episode' }, body: {}, libraryItem: item }
    const res = response()
    await controller.getEpisode(req, res)
    expect(enqueue.called).to.equal(false)
    await controller.analyzeAds(req, res)
    expect(res.code).to.equal(409)
    expect(enqueue.called).to.equal(false)
    item.extraData.adAnalysisEnabled = true
    await controller.analyzeAds({ ...req, user: { isAdminOrUp: false } }, res)
    expect(res.code).to.equal(403)
    await controller.analyzeAds({ ...req, body: { path: '/tmp/file' } }, res)
    expect(res.code).to.equal(400)
    expect(enqueue.called).to.equal(false)
    await controller.analyzeAds(req, res)
    expect(res.code).to.equal(202)
    expect(enqueue.calledOnce).to.equal(true)
  })
})
