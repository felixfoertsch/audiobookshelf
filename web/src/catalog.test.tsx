import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { itemSchema, librariesSchema, listSchema } from './catalog'
import { Button } from './shared/components/ui/button'
import { duration } from './shared/lib/duration'

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
	it('formats durations compactly and hides missing or zero values', () => {
		expect(duration(0)).toBeNull()
		expect(duration(Number.NaN)).toBeNull()
		expect(duration(59)).toBe('0:59')
		expect(duration(3661.7)).toBe('1:01:01')
		expect(duration(36000)).toBe('10:00:00')
		expect(duration(39600)).toBe('11:00:00')
	})
	it('renders registry button with native disabled behavior', () => {
		render(<Button disabled>Play</Button>)
		expect(
			(screen.getByRole('button', { name: 'Play' }) as HTMLButtonElement)
				.disabled,
		).toBe(true)
	})
})
