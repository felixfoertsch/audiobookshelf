const staticPaths = [
  '/', '/login', '/oops', '/account', '/upload', '/batch', '/config', '/debug/issues',
  '/config/libraries', '/config/authentication', '/config/users', '/config/api-keys',
  '/config/sessions', '/config/stats', '/config/backups', '/config/email',
  '/config/notifications', '/config/rss-feeds', '/config/log',
  '/config/item-metadata-utils', '/config/item-metadata-utils/genres',
  '/config/item-metadata-utils/tags', '/config/item-metadata-utils/custom-metadata-providers'
]

function validSegment(value) {
  return typeof value === 'string' && value.length > 0 &&
    !['undefined', 'null', '.', '..'].includes(value) &&
    !/[\s/\\?#:%\u0000-\u001f\u007f]/.test(value)
}

// Host policy stays outside the package: ABS IDs, ownership and current DB roles.
module.exports = function createDebugHost(database) {
  const select = (name, attributes, where) => database[`${name}Model`].findAll({
    attributes, raw: true, hooks: false, ...(where ? { where } : {})
  })

  return {
    async authorize(req, res, next) {
      if (!req.user?.id) return res.sendStatus(401)
      try {
        const user = await database.userModel.findByPk(req.user.id, {
          attributes: ['id', 'type', 'isActive']
        })
        if (!user?.isActive || !['admin', 'root'].includes(user.type)) return res.sendStatus(403)
      } catch {
        return res.status(503).send('Debug authorization unavailable')
      }
      next()
    },

    async getPaths(user) {
      const userId = user?.id
      if (!validSegment(userId) || typeof user.checkCanAccessLibraryItem !== 'function' || typeof user.checkCanAccessLibrary !== 'function') throw new Error('Invalid debug user')
      const [libraries, items, authors, series, collections, playlists, users, shares] = await Promise.all([
        select('library', ['id', 'mediaType']),
        select('libraryItem', ['id', 'mediaId', 'libraryId', 'mediaType']),
        select('author', ['id', 'libraryId']),
        select('series', ['id', 'libraryId']),
        select('collection', ['id', 'libraryId']),
        select('playlist', ['id', 'libraryId', 'userId'], { userId }),
        select('user', ['id']),
        select('mediaItemShare', ['slug', 'expiresAt', 'mediaItemType', 'mediaItemId'])
      ])
      const libraryTypes = new Map(libraries.filter((row) => validSegment(row.id) && ['book', 'podcast'].includes(row.mediaType) && user.checkCanAccessLibrary(row.id)).map((row) => [row.id, row.mediaType]))
      const backedItems = items.filter((row) => validSegment(row.id) && validSegment(row.mediaId) && libraryTypes.get(row.libraryId) === row.mediaType)
      const [books, podcasts] = await Promise.all(['book', 'podcast'].map((type) => {
        const ids = backedItems.filter((row) => row.mediaType === type).map((row) => row.mediaId)
        return ids.length ? select(type, ['id', 'explicit', 'tags'], { id: ids }) : []
      }))
      const media = new Map([...books, ...podcasts].map((row) => [row.id, row]))
      const validItems = backedItems.filter((row) => media.has(row.mediaId) && user.checkCanAccessLibraryItem({ ...row, media: media.get(row.mediaId) }))
      const bookIds = new Set(validItems.filter((row) => row.mediaType === 'book').map((row) => row.mediaId))
      const podcastIds = new Set(validItems.filter((row) => row.mediaType === 'podcast').map((row) => row.mediaId))
      // Share creation accepts any nonblank string; encode it as one route segment.
      const activeShares = shares.filter((row) => typeof row.slug === 'string' && row.slug.trim() && !['undefined', 'null', '.', '..'].includes(row.slug) && !/[\u0000-\u001f\u007f]/.test(row.slug) && validSegment(row.mediaItemId) &&
        (row.expiresAt == null || new Date(row.expiresAt).valueOf() >= Date.now()))
      const episodeIds = activeShares.filter((row) => row.mediaItemType === 'podcastEpisode').map((row) => row.mediaItemId)
      const episodes = episodeIds.length ? await select('podcastEpisode', ['id', 'podcastId'], { id: episodeIds }) : []
      const sharedEpisodeIds = new Set(episodes.filter((row) => podcastIds.has(row.podcastId)).map((row) => row.id))
      const paths = new Set(staticPaths)
      const add = (...segments) => paths.add(`/${segments.map(encodeURIComponent).join('/')}`)
      for (const [id, type] of libraryTypes) {
        add('library', id)
        for (const page of ['bookshelf', 'search', 'stats']) add('library', id, page)
        for (const mode of type === 'book' ? ['series', 'authors', 'collections', 'playlists'] : ['playlists']) add('library', id, 'bookshelf', mode)
        if (type === 'book') add('library', id, 'narrators')
        else for (const page of ['search', 'latest', 'download-queue']) add('library', id, 'podcast', page)
      }
      for (const item of validItems) {
        add('item', item.id)
        if (item.mediaType === 'book') for (const page of ['chapters', 'edit', 'manage']) add('audiobook', item.id, page)
      }
      for (const [name, rows] of [['author', authors], ['collection', collections], ['playlist', playlists]]) {
        for (const row of rows) {
          if (!validSegment(row.id) || !libraryTypes.has(row.libraryId)) continue
          if (name === 'playlist' ? row.userId !== userId : libraryTypes.get(row.libraryId) !== 'book') continue
          add(name, row.id)
        }
      }
      for (const row of series) if (validSegment(row.id) && libraryTypes.get(row.libraryId) === 'book') add('library', row.libraryId, 'series', row.id)
      for (const row of users) if (validSegment(row.id)) {
        add('config', 'users', row.id)
        add('config', 'users', row.id, 'sessions')
      }
      for (const row of activeShares) {
        if (row.mediaItemType === 'book' ? bookIds.has(row.mediaItemId) : row.mediaItemType === 'podcastEpisode' && sharedEpisodeIds.has(row.mediaItemId)) add('share', row.slug)
      }
      return [...paths].sort()
    }
  }
}
