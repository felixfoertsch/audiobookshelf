import { describe, expect, it } from 'vitest'
import { groupsFromFiles } from './model'

const file = (name: string, path = '') =>
	Object.assign(new File(['x'], name), { webkitRelativePath: path })
describe('upload grouping', () => {
	it('keeps supported companion files and ignores only unknown or wrong-media files', () => {
		const [group] = groupsFromFiles(
			[
				file('book.mp3', 'Book/book.mp3'),
				file('cover.jpg', 'Book/cover.jpg'),
				file('notes.txt', 'Book/notes.txt'),
				file('bad.xyz', 'Book/bad.xyz'),
				file('cover.png', 'Book/cover.png'),
				file('text.epub', 'Book/text.epub'),
			],
			'podcast',
		)
		expect(group.files.map((x) => x.name)).toEqual(['book.mp3'])
		expect(group.other.map((x) => x.name)).toEqual([
			'cover.jpg',
			'notes.txt',
			'cover.png',
		])
		expect(group.ignored.map((x) => x.name)).toEqual(['bad.xyz', 'text.epub'])
	})
	it('splits root-level book audio files into individual items', () => {
		expect(
			groupsFromFiles([file('one.mp3'), file('two.m4b')], 'book').map((g) =>
				g.files.map((f) => f.name),
			),
		).toEqual([['one.mp3'], ['two.m4b']])
	})
	it('keeps root mixed media together and routes other files with it', () => {
		const [group] = groupsFromFiles(
			[file('one.mp3'), file('two.epub'), file('cover.jpg')],
			'book',
		)
		expect(group.files.map((x) => x.name)).toEqual(['one.mp3', 'two.epub'])
		expect(group.other.map((x) => x.name)).toEqual(['cover.jpg'])
	})
})
