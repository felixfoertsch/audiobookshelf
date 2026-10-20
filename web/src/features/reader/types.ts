import type { RefObject } from 'react'
import { z } from 'zod'

export const readerFileSchema = z
	.object({
		ino: z.union([z.string(), z.number()]).optional(),
		ebookFormat: z.string().nullish(),
		metadata: z
			.object({ ext: z.string().optional(), filename: z.string().optional() })
			.passthrough()
			.optional(),
	})
	.passthrough()
export const readerItemSchema = z
	.object({
		id: z.string().min(1),
		media: z
			.object({
				ebookFile: readerFileSchema.nullish(),
				metadata: z
					.object({
						title: z.string().optional(),
						authorName: z.string().optional(),
					})
					.passthrough()
					.optional(),
			})
			.passthrough(),
		libraryFiles: z.array(readerFileSchema).optional(),
	})
	.passthrough()
export type ReaderItem = z.infer<typeof readerItemSchema>
export type ReaderControls = { next(): void; prev(): void }
export type EngineProps = {
	data: ArrayBuffer
	initialLocation: string | number | null
	onLocation: (location: string | number, progress?: number) => void
	onError: (error: unknown) => void
	controlsRef: RefObject<ReaderControls | null>
}
export function readerFile(item: ReaderItem, fileId?: string) {
	const file = fileId
		? item.libraryFiles?.find((entry) => String(entry.ino) === fileId)
		: item.media.ebookFile
	if (!file) throw new Error('Ebook file not found')
	return {
		file,
		format: (
			file.ebookFormat ||
			file.metadata?.ext?.replace(/^\./, '') ||
			''
		).toLowerCase(),
	}
}
export function ebookPath(itemId: string, fileId?: string) {
	return `/api/items/${encodeURIComponent(itemId)}/ebook${fileId ? `/${encodeURIComponent(fileId)}` : ''}`
}
export function pageProgress(page: number, total: number) {
	return Math.max(0, Math.min(1, (page - 1) / total))
}
export function savedPage(location: string | number | null, total: number) {
	const page = Number(location)
	return Number.isSafeInteger(page) && page > 0 && page <= total ? page : 1
}
