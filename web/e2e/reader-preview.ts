import { readFile } from 'node:fs/promises'

// Add these descriptors to fixture catalog without replacing existing audio items.
export const readerFixtures = [
	{
		id: 'read-epub',
		title: 'Original EPUB reader',
		format: 'epub',
		file: 'reader.epub',
		type: 'application/epub+zip',
	},
	{
		id: 'read-pdf',
		title: 'Original PDF reader',
		format: 'pdf',
		file: 'reader.pdf',
		type: 'application/pdf',
	},
	{
		id: 'read-comic',
		title: 'Original comic reader',
		format: 'cbz',
		file: 'reader.cbz',
		type: 'application/vnd.comicbook+zip',
	},
	{
		id: 'read-mobi-broken',
		title: 'Malformed MOBI reader',
		format: 'mobi',
		file: 'reader-broken.mobi',
		type: 'application/x-mobipocket-ebook',
	},
	{
		id: 'read-epub-hostile',
		title: 'Hostile EPUB reader',
		format: 'epub',
		file: 'reader-hostile.epub',
		type: 'application/epub+zip',
	},
	{
		id: 'read-mobi-hostile',
		title: 'Hostile MOBI reader',
		format: 'mobi',
		file: 'reader-hostile.mobi',
		type: 'application/x-mobipocket-ebook',
	},
] as const

export function readerEbookFile(id: string) {
	const fixture = readerFixtures.find((entry) => entry.id === id)
	if (!fixture) return null
	return {
		ino: `${id}-ebook`,
		ebookFormat: fixture.format,
		metadata: { ext: `.${fixture.format}`, filename: fixture.file },
	}
}
export async function readerFixtureResponse(
	id: string,
): Promise<Response | null> {
	const fixture = readerFixtures.find((entry) => entry.id === id)
	if (!fixture) return null
	const bytes = await readFile(
		new URL(
			`../src/features/reader/fixtures/original/${fixture.file}`,
			import.meta.url,
		),
	)
	return new Response(bytes, {
		headers: { 'content-type': fixture.type, 'cache-control': 'no-store' },
	})
}
