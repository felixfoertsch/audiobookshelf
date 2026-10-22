const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const Path = require('node:path')
const { Sequelize } = require('sequelize')
const sinon = require('sinon')
const Database = require('../../server/Database')
const PlaybackSession = require('../../server/objects/PlaybackSession')
const analysis = require('../../server/managers/AdAnalysisManager')
const SocketAuthority = require('../../server/SocketAuthority')

// Run from repository root, including when Mocha executes compiled dist-server/test.
const fixturePath = Path.resolve('web/src/test/serializer-fixtures.json')
describe('frontend serializer fixture', () => {
	it('matches real expanded models, playback session and emitted analysis payload', async () => {
		const previousDb = Database.sequelize
		const previousSettings = global.ServerSettings
		const dir = fs.mkdtempSync(Path.join(os.tmpdir(), 'abs-contract-'))
		const audioPath = Path.join(dir, 'episode.mp3')
		fs.writeFileSync(audioPath, 'sanitized fixture, not playable audio')
		const stat = fs.statSync(audioPath)
		const database = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
		const queued = [...analysis.queue]
		const active = new Set(analysis.activeEpisodes)
		const jobs = new Map(analysis.activeJobs)
		const emit = sinon.stub(SocketAuthority, 'libraryItemDataEmitter').resolves()
		try {
			global.ServerSettings = {}
			Database.sequelize = database
			database.uppercaseFirst = (str) => str ? str[0].toUpperCase() + str.slice(1) : ''
			await Database.buildModels()
			const library = await Database.libraryModel.create({ id: 'library', name: 'Fixture library', mediaType: 'podcast' })
			const folder = await Database.libraryFolderModel.create({ id: 'folder', path: '/fixtures', libraryId: library.id })
			const audioFile = { ino: '1', duration: 120, metadata: { filename: 'episode.mp3', ext: '.mp3', path: audioPath, relPath: 'episode.mp3', size: 42 } }
			const podcast = await Database.podcastModel.create({ id: 'podcast', title: 'Fixture podcast', author: 'Fixture author', numEpisodes: 5 })
			const item = await Database.libraryItemModel.create({ id: 'podcast-item', mediaId: podcast.id, mediaType: 'podcast', libraryId: library.id, libraryFolderId: folder.id, libraryFiles: [], extraData: { adAnalysisEnabled: true, privateValue: 'must not escape' } })
			for (const [index, status] of ['absent', 'candidates', 'stale', 'queued', 'running'].entries()) {
				const episode = await Database.podcastEpisodeModel.create({ id: `episode-${status}`, podcastId: podcast.id, title: `Episode ${status}`, index: index + 1, audioFile, extraData: status === 'absent' ? {} : { adAnalysis: { version: 1, status: 'candidates', reason: null, segments: [{ start: 10, end: 20 }], sourceSignature: analysis.signature(audioFile), sourceStat: status === 'stale' ? 'changed' : `${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}:${stat.ino}` } } })
				const job = { key: `${item.id}:${episode.id}`, itemId: item.id, episodeId: episode.id, sourceSignature: analysis.signature(audioFile) }
				if (status === 'queued') analysis.queue.push(job)
				if (status === 'running') { analysis.activeEpisodes.add(job.key); analysis.activeJobs.set(job.key, job) }
			}
			const expandedPodcast = await Database.libraryItemModel.getExpandedById(item.id)
			const book = await Database.bookModel.create({ id: 'book', title: 'Fixture book', audioFiles: [{ ...audioFile, index: 1 }], chapters: [{ id: 0, title: 'Chapter one', start: 0, end: 120 }] })
			await Database.libraryItemModel.create({ id: 'book-item', mediaId: book.id, mediaType: 'book', libraryId: library.id, libraryFolderId: folder.id, libraryFiles: [] })
			const expandedBook = await Database.libraryItemModel.getExpandedById('book-item')
			const session = new PlaybackSession()
			Object.assign(session, { id: 'session', userId: 'user', libraryId: library.id, libraryItemId: item.id, episodeId: 'episode-candidates', mediaType: 'podcast', duration: 120, currentTime: 5, playMethod: 0, audioTracks: [{ index: 0, contentUrl: '/api/items/podcast-item/file/1', mimeType: 'audio/mpeg', duration: 120, startOffset: 0 }] })
			const snapshot = { podcast: expandedPodcast.toOldJSONExpanded(), book: expandedBook.toOldJSONExpanded(), session: session.toJSONForClient(expandedPodcast) }
			// cancel() emits through production socket boundary, not a copied payload builder.
			analysis.cancel(item.id)
			snapshot.socket = emit.firstCall.args[2]
			assert.equal(emit.firstCall.args[0], 'episode_ad_analysis')
			const normalized = JSON.parse(JSON.stringify(snapshot, (key, value) => {
				if (typeof value === 'string' && value === audioPath) return '/fixtures/episode.mp3'
				if (['addedAt', 'updatedAt', 'createdAt'].includes(key) && value != null) return 1700000000000
				return value
			}))
			assert.ok(!JSON.stringify(normalized).includes('must not escape'))
			assert.ok(!JSON.stringify(normalized).includes('sourceSignature'))
			if (process.env.UPDATE_FRONTEND_FIXTURES === '1') {
				fs.mkdirSync(Path.dirname(fixturePath), { recursive: true })
				fs.writeFileSync(fixturePath, `${JSON.stringify(normalized, null, '\t')}\n`)
			}
			assert.deepEqual(normalized, JSON.parse(fs.readFileSync(fixturePath, 'utf8')), 'Serializer drift: review then regenerate with UPDATE_FRONTEND_FIXTURES=1 npm test')
		} finally {
			emit.restore()
			analysis.queue = queued
			analysis.activeEpisodes = active
			analysis.activeJobs = jobs
			await database.close()
			Database.sequelize = previousDb
			global.ServerSettings = previousSettings
			fs.rmSync(dir, { recursive: true, force: true })
		}
	})
})
