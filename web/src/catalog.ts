import { z } from 'zod'
import { api } from './api'

const text = z.string().nullish()
export const episodeSchema = z.object({
	id: z.string().min(1),
	title: text,
	description: text,
	duration: z.number().nonnegative().nullish(),
	publishedAt: z.number().nullish(),
	audioFile: z
		.object({ duration: z.number().nonnegative().nullish() })
		.nullish(),
})
export const itemSchema = z
	.object({
		id: z.string().min(1),
		libraryId: z.string().optional(),
		mediaType: z.enum(['podcast', 'book']),
		size: z.number().nonnegative().optional(),
		isMissing: z.boolean().optional(),
		isInvalid: z.boolean().optional(),
		numEpisodesIncomplete: z.number().nonnegative().optional(),
		rssFeed: z
			.object({ id: z.string(), feedUrl: text, slug: text })
			.passthrough()
			.nullish(),
		mediaItemShare: z
			.object({ id: z.string().optional(), slug: text })
			.passthrough()
			.nullish(),
		media: z
			.object({
				id: z.string().optional(),
				tags: z.array(z.string()).optional(),
				size: z.number().nonnegative().optional(),
				ebookFormat: text,
				metadata: z
					.object({
						title: text,
						author: text,
						authorName: text,
						description: text,
						subtitle: text,
						publisher: text,
						publishedYear: text,
						publishedDate: text,
						language: text,
						isbn: text,
						asin: text,
						explicit: z.boolean().optional(),
						abridged: z.boolean().optional(),
						authors: z
							.array(z.object({ id: z.string(), name: z.string() }))
							.optional(),
						narrators: z.array(z.string()).optional(),
						genres: z.array(z.string()).optional(),
						series: z
							.union([
								z.array(
									z.object({
										id: z.string(),
										name: z.string(),
										sequence: text,
									}),
								),
								z
									.object({ id: z.string(), name: z.string(), sequence: text })
									.transform((series) => [series]),
							])
							.optional(),
					})
					.passthrough(),
				coverPath: text,
				duration: z.number().nonnegative().optional(),
				numAudioFiles: z.number().nonnegative().optional(),
				chapters: z
					.array(
						z.object({
							id: z.union([z.number(), z.string()]),
							start: z.number().nonnegative(),
							end: z.number().nonnegative(),
							title: z.string(),
						}),
					)
					.optional(),
				numEpisodes: z.number().nonnegative().optional(),
				episodes: z.array(episodeSchema).optional(),
			})
			.passthrough(),
	})
	.passthrough()
export const librariesSchema = z.object({
	libraries: z.array(
		z.object({
			id: z.string().min(1),
			name: z.string(),
			mediaType: z.enum(['book', 'podcast']),
		}),
	),
})
export const listSchema = z.object({
	results: z.array(itemSchema),
	total: z.number().nonnegative(),
})
const searchSchema = z.object({
	podcast: z.array(z.object({ libraryItem: itemSchema })).optional(),
	book: z.array(z.object({ libraryItem: itemSchema })).optional(),
})
export function getLibraries() {
	return api('/api/libraries', librariesSchema)
}
export function getItem(id: string) {
	return api(`/api/items/${encodeURIComponent(id)}?expanded=1`, itemSchema)
}
export async function getItems(id: string, q: string, page: number) {
	const path = `/api/libraries/${encodeURIComponent(id)}`
	if (q) {
		const data = await api(
			`${path}/search?q=${encodeURIComponent(q)}&limit=100`,
			searchSchema,
		)
		return {
			results: [...(data.podcast ?? []), ...(data.book ?? [])].map(
				(match) => match.libraryItem,
			),
			total: (data.podcast?.length ?? 0) + (data.book?.length ?? 0),
		}
	}
	return api(
		`${path}/items?minified=1&limit=48&page=${page}&sort=media.metadata.title`,
		listSchema,
	)
}
export function duration(seconds: number) {
	const total = Math.max(0, Math.floor(seconds))
	return `${Math.floor(total / 3600)
		.toString()
		.padStart(2, '0')}:${Math.floor((total / 60) % 60)
		.toString()
		.padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`
}
