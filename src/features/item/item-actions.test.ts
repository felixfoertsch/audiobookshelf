import { expect, test } from 'vitest'
import { feedAddress, sharePayload } from './item-actions'

test('book shares use media.id; permanent share uses zero expiry', () => {
	expect(
		sharePayload(
			{ mediaType: 'book', media: { id: 'book-id', metadata: {} } },
			'slug',
			0,
			false,
		),
	).toEqual({
		slug: 'slug',
		mediaItemType: 'book',
		mediaItemId: 'book-id',
		expiresAt: 0,
		isDownloadable: false,
	})
})

test('rejects unsupported podcast shares and invalid input', () => {
	expect(() =>
		sharePayload(
			{ mediaType: 'podcast', media: { id: 'podcast', metadata: {} } },
			'ep',
			12,
			true,
		),
	).toThrow()
	expect(() =>
		sharePayload(
			{ mediaType: 'book', media: { id: 'book', metadata: {} } },
			'bad slug',
			0,
			false,
		),
	).toThrow()
	expect(() =>
		sharePayload(
			{ mediaType: 'book', media: { id: 'book', metadata: {} } },
			'ok',
			Number.NaN,
			false,
		),
	).toThrow()
})

test('RSS transport uses API prefix, never preview UI mount', () => {
	for (const prefix of ['', '/abs']) {
		window.__ABS_WEB_CONFIG__ = {
			basePath: `${prefix}/new`,
			apiBasePath: prefix,
		}
		expect(feedAddress('/feed/example')).toBe(
			`${window.location.origin}${prefix}/feed/example`,
		)
	}
	window.__ABS_WEB_CONFIG__ = undefined
})
