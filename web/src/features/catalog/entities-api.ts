import { z } from 'zod'
import { api } from '../../api'
import { itemSchema } from '../../catalog'

const nullableText = z.string().nullable().optional()
export const rssFeedSchema = z.object({
	id: z.string(),
	feedUrl: z.string().optional(),
	slug: z.string().optional(),
	meta: z
		.object({
			preventIndexing: z.boolean().optional(),
			ownerName: z.string().optional(),
			ownerEmail: z.string().optional(),
		})
		.optional(),
})
const permissionSchema = z
	.object({ update: z.boolean().optional(), delete: z.boolean().optional() })
	.passthrough()
	.nullable()
	.optional()
const entityBase = z.object({
	id: z.string().min(1),
	libraryId: z.string().min(1),
})
export const authorSchema = entityBase.extend({
	name: z.string(),
	imagePath: nullableText,
	description: nullableText,
	asin: nullableText,
	permissions: permissionSchema,
	libraryItems: z.array(itemSchema).optional(),
	series: z
		.array(
			z.object({
				id: z.string(),
				name: z.string(),
				items: z.array(itemSchema),
			}),
		)
		.optional(),
})
export const collectionSchema = entityBase.extend({
	permissions: permissionSchema,
	name: z.string().nullable().optional(),
	description: nullableText,
	rssFeed: rssFeedSchema.nullable().optional(),
	books: z.array(itemSchema),
})
const playlistItemSchema = z.object({
	libraryItemId: z.string(),
	libraryItem: itemSchema,
	episodeId: z.string().optional(),
	episode: z
		.object({
			id: z.string(),
			title: nullableText,
			duration: z.number().nullable().optional(),
		})
		.optional(),
})
export const playlistSchema = entityBase.extend({
	userId: z.string().min(1),
	name: z.string().nullable().optional(),
	description: nullableText,
	items: z.array(playlistItemSchema),
})
export type Author = z.infer<typeof authorSchema>
export type Collection = z.infer<typeof collectionSchema>
export type Playlist = z.infer<typeof playlistSchema>
export const collectionMembershipsSchema = z.object({
	collections: z.array(collectionSchema),
})
export const playlistMembershipsSchema = z.object({
	playlists: z.array(playlistSchema),
})
export const createMembershipCollection = (
	libraryId: string,
	name: string,
	itemId: string,
) =>
	api('/api/collections', collectionSchema, {
		method: 'POST',
		body: JSON.stringify({ libraryId, name, books: [itemId] }),
	})
export const createMembershipPlaylist = (
	libraryId: string,
	name: string,
	itemId: string,
) =>
	api('/api/playlists', playlistSchema, {
		method: 'POST',
		body: JSON.stringify({
			libraryId,
			name,
			items: [{ libraryItemId: itemId }],
		}),
	})

export const getAuthor = (id: string) =>
	api(
		`/api/authors/${encodeURIComponent(id)}?include=items,series`,
		authorSchema,
	)
export const getCollection = (id: string) =>
	api(
		`/api/collections/${encodeURIComponent(id)}?include=rssfeed`,
		collectionSchema,
	)
export const createPlaylistFromCollection = (id: string) =>
	api(`/api/playlists/collection/${encodeURIComponent(id)}`, playlistSchema, {
		method: 'POST',
	})
export const getPlaylist = (id: string) =>
	api(`/api/playlists/${encodeURIComponent(id)}`, playlistSchema)
export const updateAuthor = (
	id: string,
	body: {
		name?: string | null
		description?: string | null
		asin?: string | null
	},
) =>
	api(
		`/api/authors/${encodeURIComponent(id)}`,
		z.object({
			author: authorSchema,
			updated: z.boolean().optional(),
			merged: z.boolean().optional(),
		}),
		{
			method: 'PATCH',
			body: JSON.stringify(body),
		},
	)
export const updateCollection = (
	id: string,
	body: { name?: string; description?: string; books?: string[] },
) =>
	api(`/api/collections/${encodeURIComponent(id)}`, collectionSchema, {
		method: 'PATCH',
		body: JSON.stringify(body),
	})
export const updatePlaylist = (
	id: string,
	body: {
		name?: string
		description?: string
		items?: { libraryItemId: string; episodeId?: string }[]
	},
) =>
	api(`/api/playlists/${encodeURIComponent(id)}`, playlistSchema, {
		method: 'PATCH',
		body: JSON.stringify(body),
	})
export const deleteAuthor = (id: string) =>
	api(`/api/authors/${encodeURIComponent(id)}`, z.object({}), {
		method: 'DELETE',
	})
export const deleteCollection = (id: string) =>
	api(`/api/collections/${encodeURIComponent(id)}`, z.object({}), {
		method: 'DELETE',
	})
export const deletePlaylist = (id: string) =>
	api(`/api/playlists/${encodeURIComponent(id)}`, z.object({}), {
		method: 'DELETE',
	})
export const addCollectionBook = (id: string, libraryItemId: string) =>
	api(`/api/collections/${encodeURIComponent(id)}/book`, collectionSchema, {
		method: 'POST',
		body: JSON.stringify({ id: libraryItemId }),
	})
export const removeCollectionBook = (id: string, bookId: string) =>
	api(
		`/api/collections/${encodeURIComponent(id)}/book/${encodeURIComponent(bookId)}`,
		collectionSchema,
		{ method: 'DELETE' },
	)
export const addPlaylistItem = (
	id: string,
	item: { libraryItemId: string; episodeId?: string },
) =>
	api(`/api/playlists/${encodeURIComponent(id)}/item`, playlistSchema, {
		method: 'POST',
		body: JSON.stringify(item),
	})
export const removePlaylistItem = (
	id: string,
	item: { libraryItemId: string; episodeId?: string },
) =>
	api(
		`/api/playlists/${encodeURIComponent(id)}/item/${encodeURIComponent(item.libraryItemId)}${item.episodeId ? `/${encodeURIComponent(item.episodeId)}` : ''}`,
		playlistSchema,
		{ method: 'DELETE' },
	)
