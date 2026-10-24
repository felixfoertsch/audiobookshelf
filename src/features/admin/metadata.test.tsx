import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MetadataList, Providers } from './metadata'

afterEach(() => {
	cleanup()
	vi.unstubAllGlobals()
	vi.restoreAllMocks()
})

describe('metadata utilities', () => {
	it('sends URL-encoded UTF-8 base64 when deleting Unicode tag', async () => {
		const fetch = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ tags: ['música'] }), { status: 200 }),
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ numItemsUpdated: 2 }), { status: 200 }),
			)
		vi.stubGlobal('fetch', fetch)
		vi.spyOn(window, 'confirm').mockReturnValue(true)
		render(<MetadataList kind="tags" />)
		await screen.findByText('música')
		fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
		await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
		expect(String(fetch.mock.calls[1][0])).toContain(
			encodeURIComponent(
				btoa(String.fromCharCode(...new TextEncoder().encode('música'))),
			),
		)
	})
	it('loads provider with null authorization without exposing it', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				new Response(
					JSON.stringify({
						providers: [
							{
								id: 'p1',
								name: 'Provider',
								url: 'https://example.test',
								authHeaderValue: null,
							},
						],
					}),
					{ status: 200 },
				),
			),
		)
		render(<Providers />)
		await screen.findByText('Provider')
		expect(screen.queryByText('No custom metadata providers.')).toBeNull()
		expect(screen.queryByText('null')).toBeNull()
	})
})
