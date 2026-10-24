import { readerEbookFile, readerFixtures } from './reader-preview'
import { realRecords } from './real-media/load'

const now = 1_792_510_000_000
const date = (days: number) => now - days * 86_400_000
const cover = (name: string) => `/e2e/media/covers/${name}.svg`

export const libraries = [
	{
		id: 'podcasts',
		name: 'Field Notes',
		folders: [
			{
				id: 'podcasts-folder',
				fullPath: '/local-preview/podcasts',
				path: '/local-preview/podcasts',
				libraryId: 'podcasts',
				addedAt: now,
			},
		],
		displayOrder: 1,
		icon: 'podcast',
		mediaType: 'podcast',
		provider: 'local',
		settings: {},
		lastScan: now,
		lastScanVersion: '2.29.0',
		createdAt: now,
		lastUpdate: now,
	},
	{
		id: 'books',
		name: 'Story Shelf',
		folders: [
			{
				id: 'books-folder',
				fullPath: '/local-preview/books',
				path: '/local-preview/books',
				libraryId: 'books',
				addedAt: now,
			},
		],
		displayOrder: 2,
		icon: 'audiobooks',
		mediaType: 'book',
		provider: 'local',
		settings: {},
		lastScan: now,
		lastScanVersion: '2.29.0',
		createdAt: now,
		lastUpdate: now,
	},
]

const episodes = (show: string, audible = false) =>
	Array.from({ length: 6 }, (_, index) => {
		const id = `${show}-ep-${index + 1}`
		const isNarrated = audible && index === 0
		const duration = isNarrated ? 12.35025 : 0
		const file = 'tones/field-notes-episode-01.wav'
		const fallbackFile = isNarrated ? file : null
		return {
			libraryItemId: show,
			podcastId: show,
			id,
			oldEpisodeId: null,
			index: index + 1,
			season: '1',
			episode: String(index + 1),
			episodeType: 'full',
			title: [
				'The Quiet Observatory',
				'A Map of Rain',
				'Borrowed Light',
				'The Long Way Home',
				'Small Machines',
				'After the Signal',
			][index],
			subtitle: 'An original synthetic field recording',
			description: 'Original fixture episode. No external source material.',
			enclosure: null,
			guid: `${show}-guid-${index + 1}`,
			pubDate: new Date(date(index * 7)).toISOString(),
			chapters: [{ id: 0, start: 0, end: duration, title: 'Episode' }],
			audioFile: isNarrated
				? {
						index: 1,
						ino: `${id}-audio`,
						metadata: {
							filename: `${id}.wav`,
							ext: 'wav',
							path: `/synthetic/${file}`,
							relPath: file,
							size: 0,
							mtimeMs: now,
							ctimeMs: now,
							birthtimeMs: now,
						},
						addedAt: now,
						updatedAt: now,
						trackNumFromMeta: 1,
						discNumFromMeta: 1,
						trackNumFromFilename: 1,
						discNumFromFilename: 1,
						manuallyVerified: true,
						format: 'WAV',
						duration,
						bitRate: 128000,
						language: 'eng',
						codec: 'pcm_s16le',
						timeBase: '1/8000',
						channels: 1,
						channelLayout: 'mono',
						chapters: [],
						metaTags: {},
						mimeType: 'audio/wav',
					}
				: null,
			publishedAt: date(index * 7),
			addedAt: now,
			updatedAt: now,
			duration,
			playableFallback: fallbackFile,
			size: 0,
			audioTrack: {
				index: 1,
				contentUrl: `/api/items/${show}/file/${id}-audio`,
				mimeType: 'audio/wav',
				duration,
				startOffset: 0,
				title: `${id}.wav`,
			},
		}
	})

const podcast = (id: string, title: string, audible = false) => {
	const eps = episodes(id, audible)
	return {
		id,
		libraryItemId: id,
		metadata: {
			title,
			titleIgnorePrefix: title,
			author: 'Mira Chen',
			description: `Original synthetic series: ${title}.`,
			releaseDate: '2025-06-01',
			genres: ['Fiction', 'Science'],
			feedUrl: null,
			imageUrl: null,
			itunesPageUrl: null,
			itunesId: null,
			itunesArtistId: null,
			explicit: false,
			language: 'en',
			type: 'episodic',
		},
		coverPath: cover(id),
		tags: ['synthetic', 'fixture'],
		numEpisodes: eps.length,
		autoDownloadEpisodes: false,
		autoDownloadSchedule: null,
		lastEpisodeCheck: now,
		maxEpisodesToKeep: 0,
		maxNewEpisodesToDownload: 3,
		size: 0,
		episodes: eps,
	}
}

const books = Array.from({ length: 6 }, (_, i) => {
	const id = `book-${i + 1}`
	const title = [
		'The Glass Orchard',
		'Northbound Letters',
		'Atlas of Small Stars',
		'A Borrowed Winter',
		'The Last Cartographer',
		'Signals in the Ferns',
	][i]
	const isNarrated = i === 0
	const duration = isNarrated ? 13.883375 : 0
	const audioPath = 'tones/glass-orchard-chapter-01.wav'
	const track = {
		index: 1,
		ino: `${id}-audio`,
		metadata: {
			filename: `${title}.wav`,
			ext: 'wav',
			path: `/synthetic/${audioPath}`,
			relPath: audioPath,
			size: 0,
			mtimeMs: now,
			ctimeMs: now,
			birthtimeMs: now,
		},
		addedAt: now,
		updatedAt: now,
		trackNumFromMeta: 1,
		discNumFromMeta: 1,
		trackNumFromFilename: 1,
		discNumFromFilename: 1,
		manuallyVerified: true,
		format: 'WAV',
		duration,
		bitRate: 128000,
		language: 'eng',
		codec: 'pcm_s16le',
		timeBase: '1/8000',
		channels: 1,
		channelLayout: 'mono',
		chapters: [],
		metaTags: {},
		mimeType: 'audio/wav',
		startOffset: 0,
		title: `${title}.wav`,
		contentUrl: `/api/items/${id}/file/${id}-audio`,
	}
	const metadata = {
		title,
		subtitle: i === 1 ? null : 'An original synthetic audiobook',
		authors: [
			{
				id: `author-${(i % 3) + 1}`,
				name: ['Rowan Vale', 'Amara Okafor', 'Jun Park'][i % 3],
			},
		],
		narrators: ['Elian Brooks'],
		series: [
			{
				id: `series-${(i % 2) + 1}`,
				name: ['The Orchard Cycle', 'Wayfinder Stories'][i % 2],
				sequence: String(i + 1),
			},
		],
		genres: ['Literary Fiction', i % 2 ? 'Adventure' : 'Speculative'],
		publishedYear: String(2020 + i),
		publishedDate: null,
		publisher: 'Synthetic Press',
		description: `Original test description for ${title}. Created only for local UI preview.`,
		isbn: null,
		asin: null,
		language: 'en',
		explicit: false,
		abridged: false,
		titleIgnorePrefix: title,
		authorName: ['Rowan Vale', 'Amara Okafor', 'Jun Park'][i % 3],
		authorNameLF: ['Vale, Rowan', 'Okafor, Amara', 'Park, Jun'][i % 3],
		narratorName: 'Elian Brooks',
		seriesName: `The Orchard Cycle #${i + 1}`,
		descriptionPlain: `Original test description for ${title}. Created only for local UI preview.`,
	}
	track.duration = duration
	track.startOffset = 0
	track.title = `${title}.wav`
	track.contentUrl = `/api/items/${id}/file/${id}-audio`
	return {
		id,
		libraryItemId: id,
		metadata,
		coverPath: cover(id),
		tags: ['synthetic', 'fixture'],
		numTracks: 1,
		numAudioFiles: isNarrated ? 1 : 0,
		numChapters: 1,
		duration,
		size: 0,
		ebookFormat: undefined,
		audioFiles: isNarrated ? [track] : [],
		chapters: [{ id: 0, start: 0, end: duration, title: title }],
		ebookFile: null,
		tracks: isNarrated ? [track] : [],
		playableFallback: isNarrated ? audioPath : null,
	}
})

const item = <T extends Record<string, unknown>>(
	id: string,
	libraryId: string,
	mediaType: 'book' | 'podcast',
	media: T,
) => ({
	id,
	ino: `${id}-ino`,
	oldLibraryItemId: null,
	libraryId,
	folderId: `${libraryId}-folder`,
	path: `/synthetic/${id}`,
	relPath: `${id}`,
	isFile: false,
	mtimeMs: now,
	ctimeMs: now,
	birthtimeMs: now,
	addedAt: now,
	updatedAt: now,
	isMissing: false,
	isInvalid: false,
	mediaType,
	media,
	numFiles: 1,
	size: 0,
	lastScan: now,
	scanVersion: '2.29.0',
	libraryFiles:
		mediaType === 'book' && Array.isArray(media.audioFiles)
			? (
					media.audioFiles as {
						ino: string
						metadata: Record<string, unknown>
					}[]
				).map((file) => ({
					ino: file.ino,
					metadata: file.metadata,
					fileType: 'audio',
				}))
			: [],
})
const expandedPodcasts = [
	podcast('podcast-1', 'Field Notes', true),
	...Array.from({ length: 5 }, (_, i) =>
		podcast(
			`podcast-${i + 2}`,
			[
				'Night Garden',
				'Signal & Soil',
				'The Paper Astronomer',
				'Small Hours',
				'Open Water',
			][i],
		),
	),
]
export const realItems = realRecords.map((record) => {
	let offset = 0
	const tracks = record.tracks.map((source, index) => {
		const audio = {
			...books[0].tracks[0],
			index: index + 1,
			ino: source.id,
			metadata: {
				...books[0].tracks[0].metadata,
				filename: source.file.split('/').pop() || source.file,
				ext: 'mp3',
				path: `/local-preview/${source.file}`,
				relPath: source.file,
				size: source.size,
			},
			duration: source.duration,
			mimeType: 'audio/mpeg',
			format: 'MP3',
			codec: 'mp3',
			startOffset: offset,
			title: source.title,
			contentUrl: `/api/items/${record.id}/file/${source.id}`,
		}
		offset += source.duration
		return audio
	})
	const common = {
		id: record.id,
		libraryItemId: record.id,
		coverPath: `/e2e/media/${record.cover}`,
		tags: ['local-real-media'],
		size: record.tracks.reduce((n, t) => n + t.size, 0),
	}
	if (record.kind === 'podcast') {
		const base = podcast(record.id, record.title)
		const eps = record.tracks.map((source, index) => ({
			...base.episodes[0],
			id: source.id,
			index: index + 1,
			title: source.title,
			description: '',
			subtitle: '',
			guid: source.guid,
			pubDate: source.pubDate,
			publishedAt: Date.parse(source.pubDate) || now,
			enclosure: source.enclosure,
			duration: source.duration,
			size: source.size,
			audioFile: tracks[index],
			audioTrack: tracks[index],
			chapters: [],
			playableFallback: source.file,
		}))
		return item(record.id, 'podcasts', 'podcast', {
			...base,
			...common,
			metadata: {
				...base.metadata,
				author: record.author,
				description: record.description,
				language: record.language,
				feedUrl: record.feedUrl,
				itunesPageUrl: record.sourceUrl,
			},
			episodes: eps,
			numEpisodes: eps.length,
			autoDownloadEpisodes: false,
			maxNewEpisodesToDownload: 1,
		})
	}
	const chapters = tracks.map((track, index) => ({
		id: index,
		start: track.startOffset,
		end: track.startOffset + track.duration,
		title: track.title,
	}))
	return item(record.id, 'books', 'book', {
		...books[0],
		...common,
		metadata: {
			...books[0].metadata,
			title: record.title,
			titleIgnorePrefix: record.title,
			subtitle: null,
			authors: [{ id: 'real-nietzsche', name: record.author }],
			authorName: record.author,
			authorNameLF: 'Nietzsche, Friedrich',
			narrators: ['Ramona Deininger-Schnabel'],
			narratorName: 'Ramona Deininger-Schnabel',
			series: [],
			seriesName: '',
			language: 'de',
			genres: ['Philosophy'],
			description: record.description,
			descriptionPlain: record.description,
			publisher: 'LibriVox',
		},
		duration: offset,
		tracks,
		audioFiles: tracks,
		chapters,
		numTracks: tracks.length,
		numAudioFiles: tracks.length,
		numChapters: chapters.length,
		playableFallback: record.tracks[0].file,
	})
})
export const items = [
	...expandedPodcasts.map((p) => item(p.id, 'podcasts', 'podcast', p)),
	...books.map((b) => item(b.id, 'books', 'book', b)),
	...realItems,
	...readerFixtures.map((reader) =>
		item(reader.id, 'books', 'book', {
			...books[1],
			id: reader.id,
			libraryItemId: reader.id,
			metadata: {
				...books[1].metadata,
				title: reader.title,
				titleIgnorePrefix: reader.title,
			},
			ebookFile: readerEbookFile(reader.id),
			ebookFormat: reader.format,
			audioFiles: [],
			tracks: [],
			chapters: [],
			numTracks: 0,
			numAudioFiles: 0,
			numChapters: 0,
			duration: 0,
			playableFallback: null,
		}),
	),
]
export const minifiedItems = items.map(
	({
		lastScan: _lastScan,
		scanVersion: _scanVersion,
		libraryFiles: _libraryFiles,
		...value
	}) => ({
		...value,
		media: {
			...value.media,
			episodes: undefined,
			audioFiles: undefined,
			chapters: undefined,
			tracks: undefined,
		},
	}),
)
export const playable: Record<
	string,
	{ file: string; fallbackFile: string; duration: number; mimeType: string }
> = Object.fromEntries([
	...realRecords.flatMap((record) =>
		record.tracks.map((track, index) => [
			record.kind === 'book' && index === 0 ? record.id : track.id,
			{
				file: track.file,
				fallbackFile: track.file,
				duration: track.duration,
				mimeType: 'audio/mpeg',
			},
		]),
	),
	[
		expandedPodcasts[0].episodes[0].id,
		{
			file: 'local/field-notes-episode-01.wav',
			fallbackFile: 'tones/field-notes-episode-01.wav',
			duration: 12.35025,
			mimeType: 'audio/wav',
		},
	],
	[
		'book-1',
		{
			file: 'local/glass-orchard-chapter-01.wav',
			fallbackFile: 'tones/glass-orchard-chapter-01.wav',
			duration: 13.883375,
			mimeType: 'audio/wav',
		},
	],
])

// Portable generated book: chapter two crosses the 4 s track boundary.
export const boundaryBook = item('book-boundaries', 'books', 'book', {
	...books[0],
	id: 'book-boundaries',
	libraryItemId: 'book-boundaries',
	metadata: {
		...books[0].metadata,
		title: 'Boundary Atlas',
		titleIgnorePrefix: 'Boundary Atlas',
	},
	coverPath: cover('book-1'),
	duration: 15,
	numTracks: 3,
	numAudioFiles: 3,
	numChapters: 3,
	chapters: [
		{ id: 0, title: 'Departure', start: 0, end: 3 },
		{ id: 1, title: 'Across the bridge', start: 3, end: 8 },
		{ id: 2, title: 'Arrival', start: 8, end: 15 },
	],
	audioFiles: [4, 5, 6].map((duration, index) => ({
		...books[0].audioFiles[0],
		ino: `boundary-${index + 1}`,
		index: index + 1,
		duration,
		metadata: {
			...books[0].audioFiles[0].metadata,
			filename: `boundary-book-${index + 1}.wav`,
			ext: '.wav',
			path: `/synthetic/book-boundaries/boundary-book-${index + 1}.wav`,
			size: [64044, 80044, 96044][index],
		},
	})),
	tracks: [4, 5, 6].map((duration, index) => ({
		...books[0].tracks[0],
		index: index + 1,
		ino: `boundary-${index + 1}`,
		duration,
		startOffset: [0, 4, 9][index],
		title: `Part ${index + 1}`,
		contentUrl: `/media/boundary-${index + 1}`,
	})),
	playableFallback: 'tones/boundary-book-1.wav',
})
items.push(boundaryBook)
minifiedItems.push({
	...boundaryBook,
	media: {
		...boundaryBook.media,
		episodes: undefined,
		audioFiles: undefined,
		chapters: undefined,
		tracks: undefined,
	},
})
for (const [index, duration] of [4, 5, 6].entries())
	playable[`boundary-${index + 1}`] = {
		file: `tones/boundary-book-${index + 1}.wav`,
		fallbackFile: `tones/boundary-book-${index + 1}.wav`,
		duration,
		mimeType: 'audio/wav',
	}
playable[boundaryBook.id] = playable['boundary-1']
