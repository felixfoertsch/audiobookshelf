import { describe, expect, it } from 'vitest'
import { authorSchema, collectionSchema, playlistSchema } from './entities-api'

const base = { id: 'id', libraryId: 'lib' }
describe('entity API schemas', () => {
	it('accepts nullable author and collection metadata and expanded books', () => {
		expect(
			authorSchema.parse({
				...base,
				permissions: { update: true, delete: false },
				name: 'Author',
				description: null,
				libraryItems: [],
			}).description,
		).toBeNull()
		expect(
			collectionSchema.parse({
				...base,
				permissions: { update: true },
				name: null,
				description: null,
				books: [],
			}).books,
		).toEqual([])
	})
	it('validates expanded playlist item shape and nullable descriptions', () => {
		expect(
			playlistSchema.parse({
				...base,
				userId: 'owner',
				name: 'List',
				description: null,
				items: [],
			}).description,
		).toBeNull()
		expect(() =>
			playlistSchema.parse({
				...base,
				userId: 'owner',
				items: [{ libraryItemId: 'book', libraryItem: {} }],
			}),
		).toThrow()
	})
})
