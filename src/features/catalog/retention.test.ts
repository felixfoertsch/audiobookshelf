import { describe, expect, it } from 'vitest'
import { itemSchema } from '../../catalog'
import { statsSchema } from './browse-api'
import {
	persistSearch,
	podcastSearch,
	preferredSearch,
	writeCatalogSettings,
} from './preferences'
import { quickMatchOptions } from './selection-tools'

describe('native catalog retention', () => {
	it('retains included native fields through item, media and metadata parsing', () => {
		const source = {
			id: 'book',
			mediaType: 'book',
			isMissing: true,
			numEpisodesIncomplete: 2,
			rssFeed: { id: 'feed', feedUrl: '/feed/x' },
			mediaItemShare: { id: 'share', slug: 'slug' },
			media: {
				id: 'media',
				tags: ['Tag'],
				size: 42,
				ebookFormat: 'epub',
				metadata: {
					title: 'Title',
					subtitle: 'Sub',
					publisher: 'Publisher',
					publishedYear: '2026',
					publishedDate: '2026-01-01',
					language: 'en',
					isbn: 'isbn',
					asin: 'asin',
					explicit: true,
					abridged: false,
				},
			},
		}
		expect(itemSchema.parse(source)).toEqual(source)
		expect(
			itemSchema.safeParse({ ...source, media: { ...source.media, tags: [3] } })
				.success,
		).toBe(false)
	})
	it('accepts native empty-podcast SUM duration without inventing zero', () => {
		const stats = statsSchema.parse({
			totalItems: 1,
			totalSize: 0,
			totalDuration: 0,
			numAudioTracks: 0,
			totalGenres: 0,
			genresWithCount: [],
			longestItems: [{ id: 'podcast', title: 'No episodes', duration: null }],
			largestItems: [{ id: 'podcast', title: 'No episodes', size: 0 }],
		})
		expect(stats.longestItems[0].duration).toBeNull()
	})
	it('preserves unrelated Classic browser settings while saving catalog preferences', () => {
		localStorage.setItem(
			'userSettings',
			JSON.stringify({
				playbackRate: 1.5,
				orderBy: 'addedAt',
				bookshelfView: 1,
				bookshelfCoverSize: 220,
				filterBy: 'authors.encoded',
				orderDesc: true,
			}),
		)
		writeCatalogSettings({ orderDesc: true })
		expect(
			JSON.parse(localStorage.getItem('userSettings') || '{}').playbackRate,
		).toBe(1.5)
		expect(preferredSearch({}).sort).toBe('addedAt')
		expect(preferredSearch({ sort: 'size' }).sort).toBe('size')
		expect(preferredSearch({}).view).toBe('grid')
		expect(preferredSearch({}).desc).toBe('1')
		persistSearch({ ...preferredSearch({}), view: 'detail' }, '')
		expect(
			JSON.parse(localStorage.getItem('userSettings') || '{}').bookshelfView,
		).toBe(1)
		expect(preferredSearch({}).view).toBe('detail')
		expect(
			podcastSearch(
				preferredSearch({ sort: 'progress', filter: 'authors.encoded' }),
			),
		).toMatchObject({
			sort: 'media.metadata.title',
			filter: 'all',
			collapse: '0',
		})
		expect(
			podcastSearch(
				preferredSearch({
					sort: 'media.metadata.author',
					filter: 'tags.encoded',
				}),
			),
		).toMatchObject({ sort: 'media.metadata.author', filter: 'tags.encoded' })
		expect(
			quickMatchOptions.parse({
				provider: 'google',
				overrideCover: false,
				overrideDetails: true,
			}).overrideCover,
		).toBe(false)
	})
})
