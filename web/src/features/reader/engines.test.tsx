import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createRef, useCallback, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Pdf } from './Pdf'
import type { ReaderControls } from './types'

const pdf = vi.hoisted(() => ({ getPage: vi.fn(), destroy: vi.fn() }))
vi.mock('pdfjs-dist', () => ({
	GlobalWorkerOptions: {},
	TextLayer: class {
		constructor(
			private options: {
				container: HTMLElement
				textContentSource: { items: { str: string }[] }
			},
		) {}
		async render() {
			this.options.container.textContent = this.options.textContentSource.items
				.map((item) => item.str)
				.join(' ')
		}
		cancel() {}
	},
	getDocument: () => ({
		promise: Promise.resolve({ numPages: 3, ...pdf }),
		destroy: pdf.destroy,
	}),
}))

describe('PDF page boundary', () => {
	it('rejects fractions/empty/NaN and permits first/last pages', async () => {
		vi.stubGlobal(
			'ResizeObserver',
			class {
				observe() {}
				disconnect() {}
			},
		)
		pdf.getPage.mockImplementation(async () => ({
			getViewport: () => ({ width: 300, height: 400 }),
			render: () => ({ promise: Promise.resolve(), cancel() {} }),
			getAnnotations: async () => [],
			streamTextContent: () => ({ items: [{ str: 'Accessible PDF content' }] }),
		}))
		const onLocation = vi.fn()
		render(
			<Pdf
				data={new ArrayBuffer(1)}
				initialLocation={1}
				controlsRef={createRef<ReaderControls>()}
				onLocation={onLocation}
				onError={vi.fn()}
			/>,
		)
		await waitFor(() => expect(pdf.getPage).toHaveBeenCalledWith(1))
		expect(await screen.findByText('Accessible PDF content')).toBeTruthy()
		const page = screen.getByLabelText('PDF page')
		for (const value of ['1.5', '', 'NaN'])
			fireEvent.change(page, { target: { value } })
		expect(onLocation).not.toHaveBeenCalled()
		fireEvent.change(page, { target: { value: '3' } })
		expect(onLocation).toHaveBeenLastCalledWith(3, 2 / 3)
		fireEvent.change(page, { target: { value: '1' } })
		expect(onLocation).toHaveBeenLastCalledWith(1, 0)
	})
})

it('propagates malformed MOBI image failure to visible reader error', async () => {
	const { Mobi } = await import('./Mobi')
	const { default: Parser } = await import(
		'../../../../client/assets/ebooks/mobi.js'
	)
	const prototype = Parser.prototype as unknown as {
		load(): void
		read_text(): string
		render_image(): Promise<string>
	}
	vi.spyOn(prototype, 'load').mockImplementation(() => {})
	vi.spyOn(prototype, 'read_text').mockReturnValue('<p><img recindex="1"></p>')
	// render_image is an instance field, so malformed read_image exercises its actual rejecting promise.
	const imagePrototype = prototype as unknown as { read_image(): Blob }
	vi.spyOn(imagePrototype, 'read_image').mockImplementation(() => {
		throw new Error('Malformed MOBI image')
	})
	function Probe() {
		const [error, setError] = useState('')
		const onError = useCallback((cause: unknown) => setError(String(cause)), [])
		return (
			<>
				<Mobi
					data={new ArrayBuffer(1)}
					initialLocation={null}
					controlsRef={createRef<ReaderControls>()}
					onLocation={() => {}}
					onError={onError}
				/>
				<p role="alert">{error}</p>
			</>
		)
	}
	render(<Probe />)
	await waitFor(() =>
		expect(screen.getByRole('alert').textContent).toContain(
			'Malformed MOBI image',
		),
	)
	vi.restoreAllMocks()
})
