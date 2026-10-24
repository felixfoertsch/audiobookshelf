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

it('hides controls without overflow, rechecks changed content and resize', () => {
	const { rerender } = render(
		<ShelfCarousel label="Shows" hero={false}>
			<article>One</article>
		</ShelfCarousel>,
	)
	const region = screen.getByRole('region', { name: 'Shows' })
	Object.defineProperties(region, {
		clientWidth: { value: 500, configurable: true },
		scrollWidth: { value: 500, configurable: true },
	})
	fireEvent.scroll(region)
	expect(screen.queryByRole('button', { name: 'Next Shows' })).toBeNull()
	Object.defineProperty(region, 'scrollWidth', {
		value: 1000,
		configurable: true,
	})
	rerender(
		<ShelfCarousel label="Shows" hero={false}>
			<article>One</article>
			<article>Two</article>
		</ShelfCarousel>,
	)
	expect(screen.getByRole('button', { name: 'Next Shows' })).toBeTruthy()
	Object.defineProperty(region, 'clientWidth', {
		value: 1000,
		configurable: true,
	})
	fireEvent(window, new Event('resize'))
	expect(screen.queryByRole('button', { name: 'Next Shows' })).toBeNull()
})

it('clips carousel at left content inset while retaining right bleed', () => {
	render(
		<ShelfCarousel label="Newest Episodes" hero={false}>
			<article>Episode</article>
		</ShelfCarousel>,
	)
	const region = screen.getByRole('region', { name: 'Newest Episodes' })
	expect(region.className).not.toContain('-ml-')
	expect(region.className).toContain(
		'w-[calc(100vw-var(--shelf-sidebar)-var(--shelf-gutter))]',
	)
	expect(region.className).not.toContain('pl-[calc(')
})
