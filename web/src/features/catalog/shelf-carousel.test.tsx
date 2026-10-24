import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ShelfCarousel } from './shelf-carousel'

afterEach(cleanup)
it('disables ends and scrolls one page with snap enabled', () => {
	render(
		<ShelfCarousel label="Shows" hero={false}>
			<article>Show</article>
		</ShelfCarousel>,
	)
	const region = screen.getByRole('region', { name: 'Shows' })
	Object.defineProperties(region, {
		clientWidth: { value: 500 },
		scrollWidth: { value: 1500 },
	})
	const scroll = vi.fn()
	region.scrollBy = scroll
	fireEvent.scroll(region)
	expect(
		(
			screen.getByRole('button', {
				name: 'Previous Shows',
			}) as HTMLButtonElement
		).disabled,
	).toBe(true)
	fireEvent.click(screen.getByRole('button', { name: 'Next Shows' }))
	expect(scroll).toHaveBeenCalledWith({ left: 500, behavior: 'smooth' })
	region.scrollLeft = 1000
	fireEvent.scroll(region)
	expect(
		(screen.getByRole('button', { name: 'Next Shows' }) as HTMLButtonElement)
			.disabled,
	).toBe(true)
})
