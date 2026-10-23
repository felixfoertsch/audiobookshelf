import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EpisodeDescription } from './EpisodeRow'

describe('EpisodeDescription', () => {
	it('does not show expand control for short description', () => {
		render(<EpisodeDescription text="Short" />)
		expect(screen.queryByRole('button')).toBeNull()
	})

	it('shows expander when measured content overflows', async () => {
		let measure: () => void = () => {}
		globalThis.ResizeObserver = class {
			constructor(callback: ResizeObserverCallback) {
				measure = () => callback([], this)
			}
			observe() {}
			unobserve() {}
			disconnect() {}
		} as unknown as typeof ResizeObserver
		const { container } = render(<EpisodeDescription text="Long" />)
		const content = container.querySelector('.line-clamp-2') as HTMLDivElement
		Object.defineProperties(content, {
			scrollHeight: { configurable: true, value: 80 },
			clientHeight: { configurable: true, value: 40 },
		})
		await act(async () => {
			measure()
		})
		expect(
			screen.getByRole('button', { name: 'Read description' }),
		).toBeTruthy()
		fireEvent.click(screen.getByRole('button', { name: 'Read description' }))
		expect(
			screen
				.getByRole('button', { name: 'Read less' })
				.getAttribute('aria-expanded'),
		).toBe('true')
	})
})
