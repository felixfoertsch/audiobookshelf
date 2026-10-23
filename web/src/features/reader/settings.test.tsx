import '@testing-library/jest-dom/vitest'
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Epub } from './Epub'

const mock = vi.hoisted(() => ({
	rendition: {
		themes: { default: vi.fn(), fontSize: vi.fn(), font: vi.fn() },
		spread: vi.fn(),
		on: vi.fn(),
	},
	book: {
		spine: { hooks: { content: { register: vi.fn() } } },
		renderTo: vi.fn(),
		ready: new Promise(() => {}),
		destroy: vi.fn(),
	},
}))
vi.mock('epubjs', () => ({ default: () => mock.book, EpubCFI: class {} }))
afterEach(() => {
	cleanup()
	localStorage.clear()
	vi.clearAllMocks()
})

describe('reader settings outcomes', () => {
	it('applies settings, persists choices, and restores them on next render', async () => {
		mock.book.renderTo.mockReturnValue(mock.rendition)
		const props = {
			data: new ArrayBuffer(0),
			initialLocation: null,
			onLocation: vi.fn(),
			onError: vi.fn(),
			controlsRef: { current: null },
		}
		const { unmount } = render(<Epub {...props} />)
		fireEvent.click(screen.getByRole('button', { name: 'Reader settings' }))
		fireEvent.change(screen.getByRole('combobox', { name: 'Theme' }), {
			target: { value: 'sepia' },
		})
		fireEvent.change(screen.getByRole('combobox', { name: 'Font family' }), {
			target: { value: 'sans-serif' },
		})
		fireEvent.change(screen.getByRole('slider', { name: /Font scale/ }), {
			target: { value: '125' },
		})
		fireEvent.change(screen.getByRole('slider', { name: /Line spacing/ }), {
			target: { value: '140' },
		})
		fireEvent.change(screen.getByRole('slider', { name: /Font boldness/ }), {
			target: { value: '25' },
		})
		fireEvent.change(screen.getByRole('combobox', { name: 'Layout' }), {
			target: { value: 'none' },
		})
		await waitFor(() =>
			expect(
				JSON.parse(localStorage.getItem('ereaderSettings') || '{}'),
			).toMatchObject({
				theme: 'sepia',
				font: 'sans-serif',
				fontScale: 125,
				lineSpacing: 140,
				textStroke: 25,
				spread: 'none',
			}),
		)
		expect(mock.rendition.themes.default).toHaveBeenCalledWith(
			expect.objectContaining({
				body: expect.objectContaining({ background: '#f4ecd8 !important' }),
				'*': expect.objectContaining({
					'line-height': '1.75rem !important',
					'-webkit-text-stroke': '0.25px #5b4636 !important',
				}),
			}),
		)
		expect(mock.rendition.themes.fontSize).toHaveBeenCalledWith('125%')
		expect(mock.rendition.themes.font).toHaveBeenCalledWith('sans-serif')
		expect(mock.rendition.spread).toHaveBeenCalledWith('none')
		unmount()
		render(<Epub {...props} />)
		fireEvent.click(screen.getByRole('button', { name: 'Reader settings' }))
		expect(screen.getByRole('combobox', { name: 'Theme' })).toHaveValue('sepia')
		expect(screen.getByRole('combobox', { name: 'Font family' })).toHaveValue(
			'sans-serif',
		)
		expect(screen.getByRole('slider', { name: /Font scale/ })).toHaveValue(
			'125',
		)
		expect(screen.getByRole('slider', { name: /Line spacing/ })).toHaveValue(
			'140',
		)
		expect(screen.getByRole('slider', { name: /Font boldness/ })).toHaveValue(
			'25',
		)
		expect(screen.getByRole('combobox', { name: 'Layout' })).toHaveValue('none')
	})
})
