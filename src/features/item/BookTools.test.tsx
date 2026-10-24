import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BookTools } from './BookTools'

const mocks = vi.hoisted(() => ({
	user: { id: 'user', type: 'admin' },
	getItem: vi.fn(),
	api: vi.fn(),
}))
vi.mock('../../api', () => ({
	api: mocks.api,
	useAuth: Object.assign(
		(select: (state: { user: typeof mocks.user }) => unknown) =>
			select({ user: mocks.user }),
		{ getState: () => ({ user: mocks.user }) },
	),
}))
vi.mock('./service', () => ({ getItem: mocks.getItem }))
function send(event: string, payload: unknown) {
	window.dispatchEvent(
		new CustomEvent('abs:socket', { detail: { event, payload } }),
	)
}
const task = (patch: object = {}) => ({
	id: 'task-a',
	action: 'embed-metadata',
	isFinished: false,
	isFailed: false,
	data: { libraryItemId: 'A' },
	...patch,
})
beforeEach(() => {
	localStorage.clear()
	mocks.user = { id: 'user', type: 'admin' }
	mocks.getItem.mockResolvedValue({
		id: 'A',
		mediaType: 'book',
		media: {
			metadata: { title: 'Book', titleLong: 'Book by Author' },
			chapters: [{ title: 'Start', start: 0, end: 60 }],
			audioFiles: [
				{
					ino: 1,
					index: 0,
					codec: 'mp3',
					channels: 2,
					bitRate: 128000,
					metadata: { filename: 'track.mp3', size: 100 },
				},
			],
		},
	})
	mocks.api.mockImplementation(async (url: string) =>
		url === '/api/tasks?include=queue'
			? { tasks: [], queuedTaskData: { embedMetadata: [] } }
			: url.endsWith('/metadata-object')
				? { title: 'Book', artist: 'Author' }
				: {},
	)
})
afterEach(() => {
	cleanup()
	vi.restoreAllMocks()
})
describe('BookTools task lifecycle', () => {
	it('renders real metadata object and chapters, confirms embed and starts with backup', async () => {
		render(<BookTools id="A" hasAudio />)
		expect(await screen.findByText('Author')).toBeTruthy()
		expect(screen.getByText(/Start — 0s–60s/)).toBeTruthy()
		vi.spyOn(window, 'confirm').mockReturnValue(true)
		fireEvent.click(
			screen.getByRole('button', { name: 'Start metadata embed' }),
		)
		await waitFor(() =>
			expect(mocks.api).toHaveBeenCalledWith(
				'/api/tools/item/A/embed-metadata?backup=1',
				expect.anything(),
				{ method: 'POST' },
			),
		)
	})
	it('shows successful POST queued state and prevents duplicate submission', async () => {
		vi.spyOn(window, 'confirm').mockReturnValue(true)
		render(<BookTools id="A" hasAudio />)
		await screen.findByText('Author')
		const start = screen.getByRole('button', { name: 'Start metadata embed' })
		fireEvent.click(start)
		await screen.findByText('Metadata embedding queued.')
		fireEvent.click(start)
		expect(
			mocks.api.mock.calls.filter((call) =>
				String(call[0]).includes('/embed-metadata?'),
			).length,
		).toBe(1)
	})
	it('loads current task and embed queue snapshot', async () => {
		mocks.api.mockImplementation(async (url: string) =>
			url === '/api/tasks?include=queue'
				? { tasks: [task()], queuedTaskData: { embedMetadata: [] } }
				: url.endsWith('/metadata-object')
					? { title: 'Book' }
					: {},
		)
		render(<BookTools id="A" hasAudio />)
		expect(await screen.findByText('Embedding metadata: 0%')).toBeTruthy()
		expect(
			screen.queryByRole('button', { name: 'Start metadata embed' }),
		).toBeNull()
	})
	it('tracks queued, ignores other item, handles progress, failure then completion and retry', async () => {
		render(<BookTools id="A" hasAudio />)
		await screen.findByText('Book')
		send('metadata_embed_queue_update', { libraryItemId: 'B', queued: true })
		expect(screen.queryByText('Metadata embedding queued.')).toBeNull()
		send('metadata_embed_queue_update', { libraryItemId: 'A', queued: true })
		expect(await screen.findByText('Metadata embedding queued.')).toBeTruthy()
		send('task_started', task())
		send('task_progress', { libraryItemId: 'B', progress: 83 })
		expect(screen.queryByText('Embedding metadata: 83%')).toBeNull()
		send('task_progress', { libraryItemId: 'A', progress: 37 })
		expect(await screen.findByText('Embedding metadata: 37%')).toBeTruthy()
		send(
			'task_finished',
			task({ isFinished: true, isFailed: true, error: 'disk error' }),
		)
		expect(await screen.findByText('Task failed: disk error')).toBeTruthy()
		expect(
			(
				screen.getByRole('button', {
					name: 'Start metadata embed',
				}) as HTMLButtonElement
			).disabled,
		).toBe(false)
		send('task_started', task({ id: 'retry' }))
		send('task_finished', task({ id: 'retry', isFinished: true }))
		expect(await screen.findByText('Task finished')).toBeTruthy()
	})
	it('submits advanced custom encoder settings', async () => {
		render(<BookTools id="A" hasAudio />)
		await screen.findByText('Author')
		fireEvent.change(screen.getByLabelText('Tool'), {
			target: { value: 'm4b' },
		})
		fireEvent.click(screen.getByRole('button', { name: 'Advanced' }))
		fireEvent.change(screen.getByLabelText('Audio codec'), {
			target: { value: 'libopus' },
		})
		fireEvent.change(screen.getByLabelText('Audio bitrate'), {
			target: { value: '96k' },
		})
		fireEvent.change(screen.getByLabelText('Audio channels'), {
			target: { value: '6' },
		})
		fireEvent.click(screen.getByRole('button', { name: 'Start M4B encoding' }))
		await waitFor(() =>
			expect(mocks.api).toHaveBeenCalledWith(
				'/api/tools/item/A/encode-m4b?codec=libopus&bitrate=96k&channels=6',
				expect.anything(),
				{ method: 'POST' },
			),
		)
	})
	it('uses current encode options and sends cancel request', async () => {
		render(<BookTools id="A" hasAudio />)
		await screen.findByText('Book')
		fireEvent.change(screen.getByLabelText('Tool'), {
			target: { value: 'm4b' },
		})
		fireEvent.change(screen.getByLabelText('Codec'), {
			target: { value: 'opus' },
		})
		fireEvent.change(screen.getByLabelText('Bitrate'), {
			target: { value: '64k' },
		})
		fireEvent.click(screen.getByRole('button', { name: 'Start M4B encoding' }))
		await waitFor(() =>
			expect(mocks.api).toHaveBeenCalledWith(
				'/api/tools/item/A/encode-m4b?codec=opus&bitrate=64k&channels=2',
				expect.anything(),
				{ method: 'POST' },
			),
		)
		send(
			'task_started',
			task({
				action: 'encode-m4b',
				data: {
					libraryItemId: 'A',
					encodeOptions: { codec: 'opus', bitrate: '64k', channels: 2 },
				},
			}),
		)
		fireEvent.click(
			await screen.findByRole('button', { name: 'Cancel M4B encoding' }),
		)
		await waitFor(() =>
			expect(mocks.api).toHaveBeenCalledWith(
				'/api/tools/item/A/encode-m4b',
				expect.anything(),
				{ method: 'DELETE' },
			),
		)
	})
	it('blocks audio-missing and non-admin users', async () => {
		const { rerender } = render(<BookTools id="A" hasAudio={false} />)
		expect(screen.getByRole('alert').textContent).toContain('no audio')
		expect(screen.queryByRole('button')).toBeNull()
		mocks.user = { id: 'listener', type: 'user' }
		rerender(<BookTools id="A" hasAudio />)
		expect(screen.getByRole('alert').textContent).toContain('Administrator')
	})
})
