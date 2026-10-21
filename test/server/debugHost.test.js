const assert = require('node:assert/strict')
const express = require('express')
const http = require('node:http')
const { fetch } = globalThis
const createDebugHost = require('../../server/utils/debugHost')
const User = require('../../server/models/User')

function actor(permissions = {}) {
  return {
    id: 'admin', type: 'admin', isActive: true,
    permissions: { accessAllLibraries: true, accessAllTags: true, accessExplicitContent: true, ...permissions },
    checkCanAccessLibrary: User.prototype.checkCanAccessLibrary,
    checkCanAccessLibraryItem: User.prototype.checkCanAccessLibraryItem,
    checkCanAccessLibraryItemWithTags: User.prototype.checkCanAccessLibraryItemWithTags,
    get canAccessExplicitContent() { return Object.getOwnPropertyDescriptor(User.prototype, 'canAccessExplicitContent').get.call(this) }
  }
}

describe('debug host', () => {
  it('derives canonical routes from projected data, excluding missing entities and other users playlists', async () => {
    const queries = []
    const rows = {
      library: [{ id: 'books', mediaType: 'book' }, { id: 'pods', mediaType: 'podcast' }, { id: 'undefined', mediaType: 'book' }],
      libraryItem: [{ id: 'item', mediaId: 'book', libraryId: 'books', mediaType: 'book' }, { id: 'pod', mediaId: 'podcast', libraryId: 'pods', mediaType: 'podcast' }, { id: 'orphan', libraryId: 'gone', mediaType: 'book' }],
      book: [{ id: 'book', explicit: true, tags: ['private'] }],
      podcast: [{ id: 'podcast', explicit: false, tags: ['public'] }],
      author: [{ id: 'author', libraryId: 'books' }, { id: 'orphan', libraryId: 'gone' }],
      series: [{ id: 'series', libraryId: 'books' }],
      collection: [{ id: 'collection', libraryId: 'books' }],
      playlist: [{ id: 'mine', libraryId: 'pods', userId: 'admin' }, { id: 'theirs', libraryId: 'books', userId: 'other' }],
      user: [{ id: 'admin' }],
      podcastEpisode: [{ id: 'episode', podcastId: 'podcast' }],
      mediaItemShare: [
        { slug: 'book.share', mediaItemType: 'book', mediaItemId: 'book' },
        { slug: 'book share:?/#%', mediaItemType: 'book', mediaItemId: 'book' },
        { slug: 'episode', mediaItemType: 'podcastEpisode', mediaItemId: 'episode' },
        { slug: 'expired', mediaItemType: 'book', mediaItemId: 'book', expiresAt: new Date(1) },
        { slug: 'orphan', mediaItemType: 'book', mediaItemId: 'gone' },
        { slug: 'undefined', mediaItemType: 'book', mediaItemId: 'book' }
      ]
    }
    const database = Object.fromEntries(Object.entries(rows).map(([name, data]) => [`${name}Model`, {
      async findAll(options) {
        queries.push(options)
        assert.ok(options.attributes.length)
        assert.equal(options.raw, true)
        assert.equal(options.hooks, false)
        return data.filter((row) => !options.where?.userId || row.userId === options.where.userId)
      }
    }]))
    const host = createDebugHost(database)
    const paths = await host.getPaths(actor())
    assert.ok(paths.includes('/share/book%20share%3A%3F%2F%23%25'))
    const restricted = await host.getPaths(actor({ accessAllLibraries: false, librariesAccessible: ['pods'] }))
    assert.ok(!restricted.includes('/library/books'))
    assert.ok(!restricted.includes('/item/item'))
    assert.ok(!restricted.includes('/author/author'))
    assert.ok(restricted.includes('/item/pod'))
    const tagRestricted = await host.getPaths(actor({ accessAllTags: false, itemTagsSelected: ['public'] }))
    assert.ok(!tagRestricted.includes('/item/item'))
    assert.ok(tagRestricted.includes('/item/pod'))
    const explicitRestricted = await host.getPaths(actor({ accessExplicitContent: false }))
    assert.ok(!explicitRestricted.includes('/audiobook/item/edit'))
    assert.ok(explicitRestricted.includes('/item/pod'))
    for (const path of ['/config', '/config/users/admin/sessions', '/library/books/bookshelf/authors', '/library/pods/bookshelf/playlists', '/item/item', '/audiobook/item/edit', '/author/author', '/library/books/series/series', '/collection/collection', '/playlist/mine', '/share/book.share', '/share/episode']) assert.ok(paths.includes(path), path)
    for (const path of ['/playlist/theirs', '/share/expired', '/share/orphan', '/audiobook/pod/edit', '/author/orphan', '/library/pods/bookshelf/authors']) assert.ok(!paths.includes(path), path)
    assert.equal(new Set(paths).size, paths.length)
    assert.ok(paths.every((path) => path.startsWith('/') && !/undefined|:id|\/new\//.test(path)))
    assert.ok(queries.some((query) => query.where?.userId === 'admin'))
    assert.ok(queries.some((query) => query.attributes.join(',') === 'id,explicit,tags' && Array.isArray(query.where?.id)))
  })

  it('requires fresh active admin/root state for every HTTP method, independent of supplied role', async () => {
    let current = null
    let authenticated = true
    let fail = false
    const host = createDebugHost({ userModel: { async findByPk(id, options) {
      assert.equal(id, 'actor')
      assert.deepEqual(options.attributes, ['id', 'type', 'isActive'])
      if (fail) throw new Error('DB unavailable')
      return current
    } } })
    const app = express()
    app.use((req, res, next) => { if (authenticated) req.user = { id: 'actor', type: 'root' }; next() })
    app.use(['/api/debug', '/abs/api/debug'], host.authorize, (req, res) => res.json({ ok: true }))
    const server = http.createServer(app)
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    try {
      for (const prefix of ['', '/abs']) for (const method of ['GET', 'POST', 'PATCH', 'DELETE', 'PUT', 'OPTIONS', 'HEAD']) {
        for (const [user, status] of [[null, 403], [{ type: 'user', isActive: true }, 403], [{ type: 'admin', isActive: false }, 403], [{ type: 'root', isActive: true }, 200], [{ type: 'admin', isActive: true }, 200]]) {
          current = user
          const response = await fetch(`http://127.0.0.1:${server.address().port}${prefix}/api/debug`, { method, ...(method === 'HEAD' || method === 'GET' ? {} : { body: '{"path":"/item/item"}', headers: { 'content-type': 'application/json' } }) })
          assert.equal(response.status, status, `${prefix} ${method} ${JSON.stringify(user)}`)
        }
      }
      fail = true
      assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/api/debug`)).status, 503)
      authenticated = false
      assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/api/debug`)).status, 401)
    } finally {
      await new Promise((resolve) => server.close(resolve))
    }
  })
})
