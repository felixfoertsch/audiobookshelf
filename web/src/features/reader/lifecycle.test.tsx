import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Reader } from './Reader'

const state = vi.hoisted(() => ({
	generation: 1,
	user: { id: 'one' },
	api: vi.fn(),
	binary: vi.fn(),
	onLocation: null as null | ((location: number, progress: number) => void),
}))
vi.mock('../../api', () => ({
	ApiError: class extends Error {},
	api: state.api,
	apiBinary: state.binary,
	getAuthGeneration: () => state.generation,
	useAuth: { getState: () => ({ user: state.user }) },
}))
vi.mock('./Pdf', () => ({
	Pdf: (props: { onLocation: typeof state.onLocation }) => {
		state.onLocation = props.onLocation
		return <p>Loaded PDF</p>
	},
}))
vi.mock('./Epub', () => ({ Epub: () => null }))
vi.mock('./Comic', () => ({ Comic: () => null }))
vi.mock('./Mobi', () => ({ Mobi: () => null }))
afterEach(cleanup)
it.each(['close', 'session'] as const)(
	'cancels queued reader writes after %s',
	async (boundary) => {
		HTMLDialogElement.prototype.showModal = vi.fn()
		state.generation = 1
		state.api.mockReset()
		state.binary.mockResolvedValue(new ArrayBuffer(1))
		let finish: (() => void) | undefined
		state.api.mockImplementation(
			(_path: string, _schema: unknown, init?: RequestInit) =>
				init?.method === 'PATCH'
					? new Promise<void>((resolve) => {
							finish = resolve
						})
					: Promise.resolve({ ebookLocation: 1 }),
		)
		render(
			<Reader
				item={{ id: 'book', media: { ebookFile: { ebookFormat: 'pdf' } } }}
				onClose={vi.fn()}
			/>,
		)
		await screen.findByText('Loaded PDF')
		state.onLocation?.(2, 0.2)
		await waitFor(() => expect(finish).toBeTypeOf('function'))
		state.onLocation?.(3, 0.3)
		if (boundary === 'close') fireEvent.click(screen.getByText('Close reader'))
		else state.generation++
		finish?.()
		await Promise.resolve()
		await Promise.resolve()
		await Promise.resolve()
		expect(
			state.api.mock.calls.filter((call) => call[2]?.method === 'PATCH'),
		).toHaveLength(1)
	},
)
