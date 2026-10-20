import { describe, expect, it } from 'vitest'
import {
	ebookPath,
	pageProgress,
	readerFile,
	readerItemSchema,
	savedPage,
} from './types'

describe('reader source contracts', () => {
	it('selects supplementary ebooks without losing primary format', () => {
		const item = readerItemSchema.parse({
			id: 'book',
			media: { ebookFile: { ebookFormat: 'epub' } },
			libraryFiles: [{ ino: 'extra', metadata: { ext: '.PDF' } }],
		})
		expect(readerFile(item).format).toBe('epub')
		expect(readerFile(item, 'extra').format).toBe('pdf')
		expect(() => readerFile(item, 'missing')).toThrow('Ebook file not found')
	})
	it('encodes server path segments and preserves backend page progress convention', () => {
		expect(ebookPath('book/a', 'file?')).toBe(
			'/api/items/book%2Fa/ebook/file%3F',
		)
		expect(pageProgress(1, 10)).toBe(0)
		expect(pageProgress(10, 10)).toBe(0.9)
		expect(savedPage('4', 10)).toBe(4)
		for (const location of ['epubcfi(x)', -1, 0, 100, 1.5, null])
			expect(savedPage(location, 10)).toBe(1)
	})
})
