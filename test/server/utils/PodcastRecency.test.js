const { expect } = require('chai')
const sinon = require('sinon')
const filters = require('../../../server/utils/queries/libraryItemsPodcastFilters')
const libraryFilters = require('../../../server/utils/queries/libraryFilters')
const Database = require('../../../server/Database')

describe('Podcast episode recency ordering', () => {
  afterEach(() => sinon.restore())

  it('orders newest episode shelf by publication time', async () => {
    const filtered = sinon.stub(filters, 'getFilteredPodcastEpisodes').resolves({ libraryItems: [], count: 0 })
    await libraryFilters.getNewestPodcastEpisodes({ mediaType: 'podcast', id: 'lib' }, {}, 5)
    expect(filtered.firstCall.args.slice(2)).to.deep.equal(['recent', null, 'publishedAt', true, 5, 0])
  })

  it('bounds newest shelf by publication date rather than download date', async () => {
    sinon.stub(filters, 'getUserPermissionPodcastWhereQuery').returns({ podcastWhere: {}, replacements: {} })
    const query = sinon.stub(filters, 'findAndCountAll').resolves({ rows: [], count: 0 })
    await filters.getFilteredPodcastEpisodes('lib', {}, 'recent', null, 'publishedAt', true, 5, 0)
    const options = query.firstCall.args[0]
    expect(options.where).to.have.property('publishedAt')
    expect(options.where).not.to.have.property('createdAt')
    expect(options.order).to.deep.equal([['publishedAt', 'DESC']])
  })

  it('keeps addedAt item sorting tied to library-item creation time', () => {
    const order = filters.getOrder('addedAt', true)
    expect(order[0][0].val).to.equal('libraryItem.createdAt')
    expect(order[0][1]).to.equal('DESC')
  })
})
