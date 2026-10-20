import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { Comic } from './Comic'
import type { ReaderControls } from './types'

const state = vi.hoisted(() => ({ extract: vi.fn(), terminate: vi.fn() }))
vi.mock('libarchive.js/src/compressed-file', () => ({
	CompressedFile: class {
		size = 1
		constructor(readonly name: string) {}
		extract() {
			return state.extract(this.name)
		}
	},
}))
vi.mock('libarchive.js/main.js', async () => {
	const { CompressedFile } = await import('libarchive.js/src/compressed-file')
	return {
		Archive: {
			init() {},
			open: async () => ({
				_worker: { terminate: state.terminate },
				getFilesObject: async () => ({
					'page1.png': new (
						CompressedFile as unknown as new (
							name: string,
						) => unknown
					)('one'),
					'page2.png': new (
						CompressedFile as unknown as new (
							name: string,
						) => unknown
					)('two'),
				}),
			}),
		},
	}
})
afterEach(cleanup)
it('extracts selected page only, revokes replacement URL and closes worker', async () => {
	const create = vi
		.fn()
		.mockReturnValueOnce('blob:worker')
		.mockReturnValueOnce('blob:one')
		.mockReturnValueOnce('blob:two')
	const revoke = vi.fn()
	vi.stubGlobal(
		'URL',
		Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }),
	)
	state.extract.mockResolvedValue(new Blob(['image']))
	state.terminate.mockClear()
	const controlsRef = createRef<ReaderControls>()
	const view = render(
		<Comic
			data={new ArrayBuffer(1)}
			initialLocation={1}
			controlsRef={controlsRef}
			onLocation={vi.fn()}
			onError={vi.fn()}
		/>,
	)
	await waitFor(() =>
		expect(screen.getByAltText('page1.png').getAttribute('src')).toBe(
			'blob:one',
		),
	)
	expect(state.extract.mock.calls).toEqual([['one']])
	fireEvent.click(screen.getByText('Pages'))
	fireEvent.click(screen.getByText('2. page2.png'))
	await waitFor(() =>
		expect(screen.getByAltText('page2.png').getAttribute('src')).toBe(
			'blob:two',
		),
	)
	expect(state.extract.mock.calls).toEqual([['one'], ['two']])
	expect(revoke).toHaveBeenCalledWith('blob:one')
	view.unmount()
	expect(revoke).toHaveBeenCalledWith('blob:two')
	expect(state.terminate).toHaveBeenCalledOnce()
})
