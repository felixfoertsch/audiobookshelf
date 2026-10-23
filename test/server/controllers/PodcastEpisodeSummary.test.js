const { expect } = require('chai')
const sinon = require('sinon')
const controller = require('../../../server/controllers/PodcastController')
const podcastUtils = require('../../../server/utils/podcastUtils')

const response = () => ({ body: null, json(body) { this.body = body; return this } })

describe('Podcast episode summary', () => {
  afterEach(() => {
    sinon.restore()
    podcastUtils.clearPodcastFeedCache()
  })

  it('counts feed episodes and uses matched downloaded user progress', async () => {
    const feed = { episodes: [{ guid: 'done', enclosure: { url: 'one' } }, { guid: 'new', enclosure: { url: 'two' } }, { guid: 'remote', enclosure: { url: 'three' } }] }
    sinon.stub(podcastUtils, 'getPodcastFeed').resolves(feed)
    const req = {
      libraryItem: { media: { feedURL: 'https://example.com/rss', podcastEpisodes: [{ id: 'ep1', extraData: { guid: 'done' }, enclosureURL: 'one' }, { id: 'ep2', extraData: {}, enclosureURL: 'two' }] } },
      user: { getMediaProgress: (id) => id === 'ep1' ? { isFinished: true } : null }
    }
    const res = response()
    await controller.getEpisodeSummary(req, res)
    expect(res.body).to.deep.equal({ total: 3, unplayed: 2, source: 'feed' })
    await controller.getEpisodeSummary(req, response())
    expect(podcastUtils.getPodcastFeed.calledOnce).to.equal(true)
  })

  it('expires feed cache and bounds retained feeds', async () => {
    const clock = sinon.useFakeTimers()
    const fetch = sinon.stub(podcastUtils, 'getPodcastFeed').resolves({ episodes: [] })
    await podcastUtils.getCachedPodcastFeed('https://example.com/first')
    await podcastUtils.getCachedPodcastFeed('https://example.com/first')
    expect(fetch.callCount).to.equal(1)
    clock.tick(60_001)
    await podcastUtils.getCachedPodcastFeed('https://example.com/first')
    expect(fetch.callCount).to.equal(2)
    for (let index = 0; index < 100; index++) await podcastUtils.getCachedPodcastFeed(`https://example.com/${index}`)
    await podcastUtils.getCachedPodcastFeed('https://example.com/first')
    expect(fetch.callCount).to.equal(103)
  })

  it('keeps cached feed shared but completion counts user-specific', async () => {
    sinon.stub(podcastUtils, 'getPodcastFeed').resolves({ episodes: [{ enclosure: { url: 'one' } }] })
    const libraryItem = { media: { feedURL: 'https://example.com/rss', podcastEpisodes: [{ id: 'ep', enclosureURL: 'one' }] } }
    const finished = response()
    const unplayed = response()
    await controller.getEpisodeSummary({ libraryItem, user: { getMediaProgress: () => ({ isFinished: true }) } }, finished)
    await controller.getEpisodeSummary({ libraryItem, user: { getMediaProgress: () => null } }, unplayed)
    expect(finished.body.unplayed).to.equal(0)
    expect(unplayed.body.unplayed).to.equal(1)
    expect(podcastUtils.getPodcastFeed.calledOnce).to.equal(true)
  })

  it('falls back to downloaded episodes on feed failure', async () => {
    sinon.stub(podcastUtils, 'getPodcastFeed').resolves(null)
    const req = {
      libraryItem: { media: { feedURL: 'https://example.com/rss', podcastEpisodes: [{ id: 'done' }, { id: 'new' }] } },
      user: { mediaProgresses: [{ mediaItemId: 'done', isFinished: true }] }
    }
    const res = response()
    await controller.getEpisodeSummary(req, res)
    expect(res.body).to.deep.equal({ total: 2, unplayed: 1, source: 'downloaded' })
  })
})
