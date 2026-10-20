import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { duration, itemSchema, librariesSchema, listSchema } from './catalog'
import { Button } from './shared/components/ui/button'

describe('catalog trust boundary', () => {
	it('rejects malformed, null and missing payloads', () => {
		for (const input of [null, {}, '', { libraries: null }])
			expect(librariesSchema.safeParse(input).success).toBe(false)
		expect(listSchema.safeParse({ results: [], total: 0 }).success).toBe(true)
		expect(
			itemSchema.safeParse({ id: 'one', mediaType: 'podcast', media: null })
				.success,
		).toBe(false)
	})
	it('accepts nullable server metadata without inventing episodes', () => {
		const item = itemSchema.parse({
			id: 'one',
			mediaType: 'podcast',
			media: {
				metadata: { title: null, author: null, description: null },
				episodes: [],
			},
		})
		expect(item.media.episodes).toEqual([])
	})
	it('formats original timeline with 24-hour units', () => {
		expect(duration(3661.7)).toBe('01:01:01')
		expect(duration(-1)).toBe('00:00:00')
	})
	it('renders registry button with native disabled behavior', () => {
		render(<Button disabled>Play</Button>)
		expect(
			(screen.getByRole('button', { name: 'Play' }) as HTMLButtonElement)
				.disabled,
		).toBe(true)
	})
})
