import { z } from 'zod'
import { api } from '../../api'

const responseSchema = z.object({}).passthrough()
export const chapterSchema = z
	.object({
		id: z.union([z.string(), z.number()]).optional(),
		title: z.string(),
		start: z.number(),
		end: z.number(),
	})
	.passthrough()
export type Chapter = z.infer<typeof chapterSchema>

export function validateChapters(chapters: Chapter[], duration: number) {
	if (!Number.isFinite(duration) || duration < 0) return 'Invalid duration'
	for (let i = 0; i < chapters.length; i++) {
		const chapter = chapters[i]
		if (!chapter.title.trim()) return `Chapter ${i + 1} needs a title`
		if (
			!Number.isFinite(chapter.start) ||
			!Number.isFinite(chapter.end) ||
			chapter.start < 0 ||
			chapter.end <= chapter.start ||
			chapter.end > duration
		)
			return `Chapter ${i + 1} has invalid times`
		if (i === 0 && chapter.start !== 0)
			return 'First chapter must start at zero'
		if (i && chapter.start <= chapters[i - 1].start)
			return 'Chapters must be ordered by start time'
	}
	return null
}

export function chaptersPayload(chapters: Chapter[]) {
	return {
		chapters: chapters.map(({ title, start, end }) => ({ title, start, end })),
	}
}
export async function saveChapters(
	id: string,
	chapters: Chapter[],
	duration: number,
) {
	const problem = validateChapters(chapters, duration)
	if (problem) throw new Error(problem)
	return api(`/api/items/${encodeURIComponent(id)}/chapters`, responseSchema, {
		method: 'POST',
		body: JSON.stringify(chaptersPayload(chapters)),
	})
}
export async function saveTrackOrder(
	id: string,
	orderedFileData: Array<{
		index: number
		filename: string
		ino: number
		exclude: boolean
	}>,
) {
	return api(`/api/items/${encodeURIComponent(id)}/tracks`, responseSchema, {
		method: 'PATCH',
		body: JSON.stringify({ orderedFileData }),
	})
}
export async function setCoverUrl(id: string, url: string) {
	const parsed = new URL(url)
	if (!['http:', 'https:'].includes(parsed.protocol))
		throw new Error('Cover URL must use HTTP or HTTPS')
	return api(`/api/items/${encodeURIComponent(id)}/cover`, responseSchema, {
		method: 'POST',
		body: JSON.stringify({ url }),
	})
}
export async function uploadCover(id: string, file: File) {
	const body = new FormData()
	body.set('cover', file)
	return api(`/api/items/${encodeURIComponent(id)}/cover`, responseSchema, {
		method: 'POST',
		body,
	})
}
export async function removeCover(id: string) {
	return api(`/api/items/${encodeURIComponent(id)}/cover`, responseSchema, {
		method: 'DELETE',
	})
}
export async function updateMetadata(id: string, payload: unknown) {
	const parsed = z
		.object({
			metadata: z
				.object({
					series: z
						.array(
							z
								.object({
									id: z.string().optional(),
									name: z.string().trim().min(1),
									sequence: z.string().nullable().optional(),
								})
								.passthrough(),
						)
						.optional(),
				})
				.passthrough()
				.optional(),
		})
		.passthrough()
		.parse(payload)
	return api(`/api/items/${encodeURIComponent(id)}/media`, responseSchema, {
		method: 'PATCH',
		body: JSON.stringify(parsed),
	})
}
export const matchOptionsSchema = z
	.object({
		provider: z.string().min(1),
		title: z.string().optional(),
		author: z.string().optional(),
		isbn: z.string().optional(),
		asin: z.string().optional(),
		overrideCover: z.boolean().optional(),
		overrideDetails: z.boolean().optional(),
	})
	.passthrough()
export async function matchItem(
	id: string,
	options: z.infer<typeof matchOptionsSchema>,
) {
	return api(`/api/items/${encodeURIComponent(id)}/match`, responseSchema, {
		method: 'POST',
		body: JSON.stringify(matchOptionsSchema.parse(options)),
	})
}
export function shiftChapters(chapters: Chapter[], seconds: number) {
	if (!Number.isFinite(seconds))
		throw new Error('Shift must be a finite number')
	return chapters.map((chapter) => ({
		...chapter,
		start: chapter.start + seconds,
		end: chapter.end + seconds,
	}))
}
export const audibleChaptersSchema = z.object({
	runtimeLengthSec: z.number(),
	chapters: z.array(
		z.object({
			title: z.string(),
			startOffsetMs: z.number().nonnegative(),
			lengthMs: z.number().positive(),
		}),
	),
})
export function audibleChapters(value: unknown, duration: number): Chapter[] {
	const result = audibleChaptersSchema.parse(value)
	return result.chapters
		.filter((chapter) => chapter.startOffsetMs / 1000 < duration)
		.map((chapter, id) => ({
			id,
			title: chapter.title,
			start: chapter.startOffsetMs / 1000,
			end: Math.min(
				duration,
				(chapter.startOffsetMs + chapter.lengthMs) / 1000,
			),
		}))
}
export async function findChapters(asin: string, region: string) {
	return api(
		`/api/search/chapters?asin=${encodeURIComponent(asin)}&region=${encodeURIComponent(region)}`,
		responseSchema,
	)
}
export async function searchCovers(
	provider: string,
	title: string,
	author: string,
) {
	return api(
		`/api/search/covers?provider=${encodeURIComponent(provider)}&title=${encodeURIComponent(title)}&author=${encodeURIComponent(author)}`,
		z.object({ results: z.array(z.string()) }).passthrough(),
	)
}
export async function setLocalCover(id: string, path: string) {
	return api(`/api/items/${encodeURIComponent(id)}/cover`, responseSchema, {
		method: 'PATCH',
		body: JSON.stringify({ cover: path }),
	})
}
