const { expect } = require('chai')
const { catalogEndpoint, catalogResults } = require('../../../server/managers/AdAnalysisManager')
const { matchesEpisode } = require('../../../server/utils/daiAlignment')
const fixtures = require('../../fixtures/adCatalogMatching.json')

describe('deterministic ad-analysis catalog identity', () => {
  it('uses stored Apple ID, not storefront-dependent search, to discover feed', () => {
    expect(catalogEndpoint('apple', { title: 'Doppelgänger', itunesId: '1519234952' })).to.equal('https://itunes.apple.com/lookup?id=1519234952&entity=podcast')
    expect(catalogResults('apple', { results: fixtures[0].defaultSearch }).some((candidate) => candidate.title === fixtures[0].title)).to.equal(false)
    expect(catalogResults('apple', { results: [fixtures[0].catalog] })[0].title).to.equal(fixtures[0].title)
  })

  it('keeps search fallback and never interpolates unvalidated IDs', () => {
    const media = { title: 'Show', author: 'Author', itunesId: '123&evil=1' }
    expect(catalogEndpoint('apple', media)).to.equal('https://itunes.apple.com/search?media=podcast&entity=podcast&limit=5&term=Show%20Author')
    expect(catalogEndpoint('gpodder', media)).to.equal('https://gpodder.net/search.json?q=Show%20Author')
  })

  for (const show of fixtures) {
    it(`preserves unique exact-title/date matches for ${show.title}`, () => {
      const candidate = catalogResults('apple', { results: [show.catalog] })[0]
      expect(candidate.title).to.equal(show.title)
      for (const original of show.episodes) {
        const matches = show.candidates.filter((episode) => matchesEpisode(original, episode))
        expect(matches.map((episode) => episode.guid)).to.deep.equal([original.guid])
      }
    })
  }

  it('rejects different episodes with similar titles and stale publication dates', () => {
    const episode = fixtures[0].episodes[0]
    expect(matchesEpisode(episode, { ...episode, title: episode.title.replace('#607', '#608') })).to.equal(false)
    expect(matchesEpisode(episode, { ...episode, publishedAt: episode.publishedAt + 86400001 })).to.equal(false)
    expect(matchesEpisode(episode, { ...episode, title: episode.title.normalize('NFD') })).to.equal(true)
  })
})
