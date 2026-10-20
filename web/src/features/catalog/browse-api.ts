import { z } from 'zod'
import { api } from '../../api'
import { itemSchema } from '../../catalog'

export const browseSearch = z.object({
	q: z.string().max(200).default(''),
	page: z.coerce.number().int().nonnegative().default(0),
	sort: z.string().default('media.metadata.title'),
	desc: z.coerce.string().default('0'),
	filter: z.string().default('all'),
	collapse: z.coerce.string().default('0'),
	view: z.enum(['grid', 'list', 'detail']).default('grid'),
})
export type BrowseSearch = z.infer<typeof browseSearch>
export const entitySchema = z
	.object({
		id: z.string(),
		name: z.string().nullish(),
		title: z.string().nullish(),
		description: z.string().nullish(),
		numBooks: z.number().nullish(),
		progress: z
			.object({
				isFinished: z.boolean(),
				libraryItemIds: z.array(z.string()),
				libraryItemIdsFinished: z.array(z.string()),
			})
			.optional(),
		rssFeed: z
			.object({
				id: z.string(),
				feedUrl: z.string().optional(),
				slug: z.string().optional(),
			})
			.nullish(),
		books: z.array(itemSchema).optional(),
		libraryItems: z.array(itemSchema).optional(),
	})
	.passthrough()
	.refine((value) => !('media' in value), 'Invalid catalog entity')
export const entrySchema = z.union([
	itemSchema.extend({
		recentEpisode: z
			.object({
				id: z.string(),
				title: z.string().nullish(),
				duration: z.number().nullish(),
			})
			.nullish(),
		collapsedSeries: z
			.object({
				id: z.string(),
				name: z.string().nullish(),
				numBooks: z.number().optional(),
			})
			.nullish(),
	}),
	entitySchema,
])
export type Entry = z.infer<typeof entrySchema> & { _type?: string }
const list = z.object({
	results: z.array(entrySchema),
	total: z.number().nonnegative(),
})
export function libraryPath(id: string) {
	return `/api/libraries/${encodeURIComponent(id)}`
}
export function encodeFilter(value: string) {
	return btoa(unescape(encodeURIComponent(value)))
}
export function browsePath(
	library: string,
	section: string,
	search: BrowseSearch,
) {
	const params = new URLSearchParams({
		limit: '48',
		page: String(search.page),
		minified: '1',
		include: 'rssfeed,numEpisodesIncomplete,share',
		sort: search.sort,
		desc: search.desc,
	})
	if (search.filter !== 'all') params.set('filter', search.filter)
	if (search.collapse === '1') params.set('collapseseries', '1')
	return `${libraryPath(library)}/${section || 'items'}?${params}`
}
export function loadBrowse(
	library: string,
	section: string,
	search: BrowseSearch,
) {
	return api(browsePath(library, section, search), list)
}
export const shelvesSchema = z.array(
	z.object({
		id: z.string(),
		label: z.string(),
		type: z.string(),
		entities: z.array(entrySchema),
	}),
)
export function loadHome(library: string) {
	return api(
		`${libraryPath(library)}/personalized?include=rssfeed,numEpisodesIncomplete,share`,
		shelvesSchema,
	)
}
const filterValue = z.union([
	z.string(),
	z.object({ id: z.string(), name: z.string() }),
])
export const filtersSchema = z
	.object({
		genres: z.array(z.string()).optional(),
		tags: z.array(z.string()).optional(),
		series: z.array(filterValue).optional(),
		authors: z.array(filterValue).optional(),
		narrators: z.array(z.string()).optional(),
		publishers: z.array(z.string()).optional(),
		languages: z.array(z.string()).optional(),
		publishedDecades: z.array(z.string()).optional(),
	})
	.passthrough()
export function loadFilters(library: string) {
	return api(`${libraryPath(library)}/filterdata`, filtersSchema)
}
export const statsSchema = z.object({
	totalItems: z.number(),
	totalSize: z.number(),
	totalDuration: z.number(),
	numAudioTracks: z.number(),
	totalAuthors: z.number().optional(),
	totalGenres: z.number(),
	genresWithCount: z.array(z.object({ genre: z.string(), count: z.number() })),
	authorsWithCount: z
		.array(z.object({ id: z.string(), name: z.string(), count: z.number() }))
		.optional(),
	longestItems: z.array(
		z.object({
			id: z.string(),
			title: z.string(),
			duration: z.number().nullable(),
		}),
	),
	largestItems: z.array(
		z.object({ id: z.string(), title: z.string(), size: z.number() }),
	),
})
export function loadStats(library: string) {
	return api(`${libraryPath(library)}/stats`, statsSchema)
}
export const narratorsSchema = z.object({
	narrators: z.array(
		z.object({ id: z.string(), name: z.string(), numBooks: z.number() }),
	),
})
export function loadNarrators(library: string) {
	return api(`${libraryPath(library)}/narrators`, narratorsSchema)
}
export function saveNarrator(library: string, id: string, name?: string) {
	return api(
		`${libraryPath(library)}/narrators/${id}`,
		z.object({ updated: z.number() }),
		{
			method: name === undefined ? 'DELETE' : 'PATCH',
			...(name === undefined
				? {}
				: {
						body: JSON.stringify({
							name: z.string().trim().min(1).parse(name),
						}),
					}),
		},
	)
}
const searchMatch = z.object({ libraryItem: itemSchema })
const namedMatch = z.object({
	name: z.string(),
	numItems: z.number().optional(),
	numBooks: z.number().optional(),
})
export const searchSchema = z.object({
	book: z.array(searchMatch).optional(),
	podcast: z.array(searchMatch).optional(),
	episodes: z
		.array(
			z
				.object({
					libraryItem: itemSchema.extend({
						recentEpisode: z
							.object({ id: z.string(), title: z.string().nullish() })
							.optional(),
					}),
				})
				.transform((value) => ({
					...value,
					episode: value.libraryItem.recentEpisode,
				})),
		)
		.optional(),
	authors: z.array(entitySchema).optional(),
	series: z
		.array(
			z
				.object({ series: entitySchema, books: z.array(itemSchema) })
				.transform((value) => ({ ...value.series, books: value.books })),
		)
		.optional(),
	tags: z.array(namedMatch).optional(),
	narrators: z.array(namedMatch).optional(),
	genres: z.array(namedMatch).optional(),
})
export function searchLibrary(library: string, q: string, limit?: number) {
	if (!q.trim()) return Promise.resolve(searchSchema.parse({}))
	return api(
		`${libraryPath(library)}/search?q=${encodeURIComponent(q)}${limit ? `&limit=${limit}` : ''}`,
		searchSchema,
	)
}
export async function loadSeries(library: string, id: string) {
	const [series, items] = await Promise.all([
		api(
			`${libraryPath(library)}/series/${encodeURIComponent(id)}?include=progress,rssfeed`,
			entitySchema,
		),
		api(
			`${libraryPath(library)}/items?filter=series.${encodeURIComponent(encodeFilter(id))}&limit=0&include=progress&sort=media.metadata.series.sequence`,
			z.object({ results: z.array(itemSchema), total: z.number() }),
		),
	])
	return { ...series, books: items.results }
}
