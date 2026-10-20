import { z } from 'zod'
import { api } from '../../api'
import { emptySchema, type Item } from './schemas'

export const sharePayload = (
	item: Pick<Item, 'mediaType' | 'media'>,
	slug: string,
	expiresAt: number,
	isDownloadable: boolean,
) => {
	if (!/^[A-Za-z0-9_-]+$/.test(slug)) throw new Error('Invalid share slug')
	if (!Number.isFinite(expiresAt) || expiresAt < 0)
		throw new Error('Invalid share expiry')
	if (item.mediaType !== 'book' || !item.media.id)
		throw new Error('Only books can be shared here')
	return {
		slug,
		mediaItemType: 'book' as const,
		mediaItemId: item.media.id,
		expiresAt,
		isDownloadable,
	}
}

export function feedAddress(path: string) {
	if (!path.startsWith('/feed/') || path.includes('\\'))
		throw new Error('Invalid feed path')
	return `${window.location.origin}${window.__ABS_WEB_CONFIG__?.apiBasePath || ''}${path}`
}

export const itemActions = {
	createShare: (payload: ReturnType<typeof sharePayload>) =>
		api(
			'/api/share/mediaitem',
			z.object({ id: z.string(), slug: z.string() }).passthrough(),
			{ method: 'POST', body: JSON.stringify(payload) },
		),
	revokeShare: (id: string) =>
		api(`/api/share/mediaitem/${encodeURIComponent(id)}`, emptySchema, {
			method: 'DELETE',
		}),
	openFeed: (
		id: string,
		body: { slug: string; serverAddress: string; preventIndexing: boolean },
	) =>
		api(
			`/api/feeds/item/${encodeURIComponent(id)}/open`,
			z
				.object({
					feed: z.object({ id: z.string(), slug: z.string() }).passthrough(),
				})
				.passthrough(),
			{ method: 'POST', body: JSON.stringify(body) },
		),
	closeFeed: (id: string) =>
		api(`/api/feeds/${encodeURIComponent(id)}/close`, emptySchema, {
			method: 'POST',
		}),
	sendEbook: (id: string, deviceName: string) =>
		api('/api/emails/send-ebook-to-device', emptySchema, {
			method: 'POST',
			body: JSON.stringify({ libraryItemId: id, deviceName }),
		}),
	deleteItem: (id: string, hard: boolean) =>
		api(
			`/api/items/${encodeURIComponent(id)}?hard=${hard ? '1' : '0'}`,
			emptySchema,
			{ method: 'DELETE' },
		),
	setEbookStatus: (id: string, ino: string | number) =>
		api(
			`/api/items/${encodeURIComponent(id)}/ebook/${encodeURIComponent(String(ino))}/status`,
			emptySchema,
			{ method: 'PATCH' },
		),
}
