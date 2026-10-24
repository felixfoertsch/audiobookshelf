const { expect } = require('chai')
const sinon = require('sinon')
const controller = require('../../../server/controllers/LibraryController')
const filters = require('../../../server/utils/queries/libraryItemsPodcastFilters')
const podcastUtils = require('../../../server/utils/podcastUtils')
const Database = require('../../../server/Database')

const response = () => ({ body: null, json(body) { this.body = body; return this } })

describe('LibraryController.getRecentEpisodes with includeFeed', () => {
  afterEach(() => { sinon.restore(); Database.sequelize = null })

  it('merges feed entries, dedupes GUID then enclosure, sorts and paginates', async () => {
    const podcasts = [{
      libraryItem: { id: 'item', libraryId: 'lib', mediaType: 'podcast', extraData: {} },
      tags: [], explicit: false, feedURL: 'https://example.com/rss',
      toOldJSONMinified: () => ({ id: 'podcast', title: 'Podcast' })
    }]
    sinon.stub(filters, 'getRecentEpisodes').resolves([{ id: 'download', title: 'downloaded', publishedAt: 10, extraData: { guid: 'same' }, enclosureURL: 'url', podcast: { id: 'podcast' } }])
    sinon.stub(filters, 'getAccessiblePodcasts').resolves(podcasts)
    sinon.stub(filters, 'getDownloadedEpisodes').resolves([{ id: 'download', title: 'downloaded', publishedAt: 10, guid: 'same', enclosure: { url: 'url', type: 'audio/mpeg', length: '100' }, libraryItemId: 'item', podcast: { id: 'podcast' }, downloaded: true }])
    sinon.stub(podcastUtils, 'getCachedPodcastFeed').resolves({ episodes: [
      { guid: 'same', title: 'dup-guid', enclosure: { url: 'else' }, publishedAt: 20 },
      { guid: 'other', title: 'dup-url', enclosure: { url: 'url' }, publishedAt: 19 },
      { guid: 'new', title: 'new', enclosure: { url: 'new-url', type: 'audio/mpeg', length: '10' }, publishedAt: 30, durationSeconds: 5 },
      { guid: 'new', title: 'duplicate feed guid', enclosure: { url: 'newer' }, publishedAt: 29 }
    ] })
    const req = { library: { mediaType: 'podcast', id: 'lib' }, query: { includeFeed: '1', limit: '2', page: '0' }, user: { checkCanAccessLibraryItem: () => true } }
    const res = response()
    await controller.getRecentEpisodes(req, res)
    expect(res.body.episodes.map((e) => e.id)).to.deep.equal(['feed:item:new', 'download'])
    expect(res.body.episodes[0]).to.include({ downloaded: false, enclosureURL: 'new-url', duration: 5, libraryItemId: 'item', guid: 'new', podcastId: 'podcast' })
    expect(res.body.episodes[0].enclosure).to.deep.equal({ url: 'new-url', type: 'audio/mpeg', length: '10' })
    expect(res.body.episodes[1]).to.include({ downloaded: true, guid: 'same' })
    expect(res.body.episodes).to.have.length(2)
  })

  it('returns expanded downloaded row contract and scopes query by library item IDs', async () => {
    const model = { findAll: sinon.stub().resolves([{
      id: 'ep', guid: 'guid-1', enclosure: { url: 'https://media/ep', type: 'audio/mpeg', length: '12' },
      libraryItemId: 'item-1', title: 'episode', publishedAt: 123, downloaded: true,
      podcast: { libraryItem: { id: 'item-1', libraryId: 'library' }, toOldJSONMinified: () => ({ id: 'pod' }) },
      toOldJSONExpanded: () => ({ id: 'ep', guid: 'guid-1', enclosure: { url: 'https://media/ep', type: 'audio/mpeg', length: '12' }, libraryItemId: 'item-1', title: 'episode', publishedAt: 123 })
    }]) }
    Database.sequelize = { models: { podcastEpisode: model } }
    const checkCanAccessLibraryItem = sinon.stub().returns(true)
    sinon.stub(filters, 'getUserPermissionPodcastWhereQuery').returns({ podcastWhere: [{ explicit: false }], replacements: {} })
    const result = await filters.getDownloadedEpisodes({ id: 'user', checkCanAccessLibraryItem }, { id: 'library' }, ['item-1'])
    expect(result[0]).to.include({ id: 'ep', guid: 'guid-1', libraryItemId: 'item-1', downloaded: true })
    expect(result[0].enclosure).to.deep.equal({ url: 'https://media/ep', type: 'audio/mpeg', length: '12' })
    const include = model.findAll.firstCall.args[0].include[0]
    expect(include.include.where).to.deep.equal({ libraryId: 'library', id: ['item-1'] })
    expect(model.findAll.firstCall.args[0].include[0].where).to.deep.equal([{ explicit: false }])
  })

  it('does not alter legacy pagination without includeFeed', async () => {
    const recent = sinon.stub(filters, 'getRecentEpisodes').resolves([])
    const req = { library: { mediaType: 'podcast', id: 'lib' }, query: { limit: '50', page: '2' }, user: {} }
    await controller.getRecentEpisodes(req, response())
    expect(recent.calledWith(req.user, req.library, '50', 100)).to.equal(true)
  })

  it('rejects invalid includeFeed pagination and defaults valid missing values', async () => {
    const res = { status(code) { this.statusCode = code; return this }, send(message) { this.message = message; return this }, json(body) { this.body = body; return this } }
    const req = { library: { mediaType: 'podcast', id: 'lib' }, query: { includeFeed: '1', limit: '201' }, user: {} }
    await controller.getRecentEpisodes(req, res)
    expect(res.statusCode).to.equal(400)
    expect(res.message).to.equal('Invalid limit or page')
  })

  it('excludes inaccessible items and marks unavailable and capped feeds', async () => {
    const podcasts = Array.from({ length: 101 }, (_, index) => ({
      libraryItem: { id: `item-${index}`, libraryId: 'lib', mediaType: 'podcast', extraData: {} },
      tags: [], explicit: false,
      feedURL: `https://example.com/${index}`,
      toOldJSONMinified: () => ({ id: `pod-${index}` })
    }))
    sinon.stub(filters, 'getRecentEpisodes').resolves([])
    sinon.stub(filters, 'getAccessiblePodcasts').resolves(podcasts)
    sinon.stub(filters, 'getDownloadedEpisodes').resolves([])
    let active = 0
    let maxActive = 0
    const fetch = sinon.stub(podcastUtils, 'getCachedPodcastFeed').callsFake(async () => {
      active++
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setImmediate(resolve))
      active--
      return null
    })
    const req = { library: { mediaType: 'podcast', id: 'lib' }, query: { includeFeed: '1', limit: '50', page: '0' }, user: { checkCanAccessLibraryItem: ({ id }) => id !== 'item-0' } }
    const res = response()
    await controller.getRecentEpisodes(req, res)
    expect(fetch.callCount).to.equal(99)
    expect(fetch.args.flat().join(' ')).not.to.include('/0')
    expect(maxActive).to.be.at.most(4)
    expect(res.body).to.include({ feedUnavailable: true, feedTruncated: true })
  })
  it('falls back to flagged downloaded rows when feed is unavailable', async () => {
    const downloaded = { id: 'local', libraryItemId: 'item', downloaded: true, publishedAt: 12, guid: 'local' }
    sinon.stub(filters, 'getAccessiblePodcasts').resolves([{ libraryItem: { id: 'item', libraryId: 'lib' }, feedURL: 'https://example.test/rss', toOldJSONMinified: () => ({ id: 'pod' }) }])
    sinon.stub(filters, 'getDownloadedEpisodes').resolves([downloaded])
    sinon.stub(podcastUtils, 'getCachedPodcastFeed').resolves(null)
    const res = response()
    await controller.getRecentEpisodes({ library: { id: 'lib', mediaType: 'podcast' }, query: { includeFeed: '1' }, user: { checkCanAccessLibraryItem: () => true } }, res)
    expect(res.body.episodes).to.deep.equal([downloaded])
    expect(res.body).to.include({ feedUnavailable: true, feedTruncated: false, limit: 50, page: 0 })
  })

  it('paginates all 262 feed episodes without silently capping each podcast', async () => {
    sinon.stub(filters, 'getAccessiblePodcasts').resolves([{ libraryItem: { id: 'item', libraryId: 'lib' }, feedURL: 'https://example.test/rss', toOldJSONMinified: () => ({ id: 'pod' }) }])
    sinon.stub(filters, 'getDownloadedEpisodes').resolves([])
    sinon.stub(podcastUtils, 'getCachedPodcastFeed').resolves({ episodes: Array.from({ length: 262 }, (_, i) => ({ title: `Episode ${i}`, guid: `${i}`, enclosure: { url: `https://example.test/${i}.mp3` }, publishedAt: i })) })
    const res = response()
    await controller.getRecentEpisodes({ library: { id: 'lib', mediaType: 'podcast' }, query: { includeFeed: '1', limit: '100', page: '2' }, user: { checkCanAccessLibraryItem: () => true } }, res)
    expect(res.body.episodes).to.have.length(62)
    expect(res.body.episodes[0].title).to.equal('Episode 61')
    expect(res.body.episodes[61].title).to.equal('Episode 0')
  })

  it('applies real user library, explicit and tag access before reading feeds', async () => {
    const User = require('../../../server/models/User')
    const user = {
      checkCanAccessLibraryItem: User.prototype.checkCanAccessLibraryItem,
      checkCanAccessLibraryItemWithTags: User.prototype.checkCanAccessLibraryItemWithTags,
      checkCanAccessLibrary: (id) => id === 'lib',
      canAccessExplicitContent: false,
      permissions: { accessAllTags: false, itemTagsSelected: ['allowed'], selectedTagsNotAccessible: false }
    }
    sinon.stub(filters, 'getAccessiblePodcasts').resolves([
      { libraryItem: { id: 'explicit', libraryId: 'lib' }, explicit: true, tags: ['allowed'], toOldJSONMinified: () => ({}) },
      { libraryItem: { id: 'tagged', libraryId: 'lib' }, explicit: false, tags: ['blocked'], toOldJSONMinified: () => ({}) },
      { libraryItem: { id: 'private', libraryId: 'other' }, explicit: false, tags: ['allowed'], toOldJSONMinified: () => ({}) }
    ])
    const downloaded = sinon.stub(filters, 'getDownloadedEpisodes').resolves([])
    const feed = sinon.stub(podcastUtils, 'getCachedPodcastFeed')
    const res = response()
    await controller.getRecentEpisodes({ library: { id: 'lib', mediaType: 'podcast' }, query: { includeFeed: '1' }, user }, res)
    expect(downloaded.firstCall.args[2]).to.deep.equal([])
    expect(feed.called).to.equal(false)
    expect(res.body.episodes).to.deep.equal([])
  })

})
