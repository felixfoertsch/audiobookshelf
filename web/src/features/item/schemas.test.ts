import { expect, it } from 'vitest'
import { readerItemSchema } from '../reader'
import { itemSchema } from './schemas'

it('preserves native primary and supplementary reader files and metadata', () => {
	const item = itemSchema.parse({
		id: 'book',
		mediaType: 'book',
		media: {
			metadata: { title: 'Book' },
			ebookFile: {
				ino: 'main',
				ebookFormat: 'epub',
				metadata: { ext: '.epub', filename: 'book.epub' },
			},
			audioFiles: [{ ino: 'audio', duration: 20 }],
		},
		libraryFiles: [
			{ ino: 'extra', metadata: { ext: '.pdf', filename: 'extra.pdf' } },
		],
	})
	const reader = readerItemSchema.parse(item)
	expect(reader.media.ebookFile?.ino).toBe('main')
	expect(reader.libraryFiles?.[0].metadata?.filename).toBe('extra.pdf')
	expect(item.media.audioFiles).toEqual([{ ino: 'audio', duration: 20 }])
})
it('rejects malformed episode and media payloads', () => {
	expect(
		itemSchema.safeParse({
			id: 'book',
			mediaType: 'book',
			media: { metadata: { title: 22 } },
		}).success,
	).toBe(false)
})
