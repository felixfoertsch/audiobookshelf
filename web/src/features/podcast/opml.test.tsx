import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { OpmlImport } from './opml'

const state = vi.hoisted(() => ({
	user: { id: 'a', type: 'admin' },
	generation: 1,
	api: vi.fn(),
}))
vi.mock('../../api', () => ({
	api: state.api,
	getAuthGeneration: () => state.generation,
	useAuth: Object.assign(
		(select: (value: unknown) => unknown) => select({ user: state.user }),
		{ getState: () => ({ user: state.user }) },
	),
}))
const library = {
	id: 'podcasts',
	mediaType: 'podcast',
	folders: [
		{ id: 'folder', fullPath: '/podcasts' },
		{ id: 'second', fullPath: '/second' },
	],
}
const xml =
	'<opml><body><outline type="rss" xmlUrl="http://127.0.0.1/feed" /></body></opml>'
function upload(text = xml, rejects = false) {
	const file = new File([text], 'feeds.opml', { type: 'text/xml' })
	Object.defineProperty(file, 'text', {
		value: () =>
			rejects ? Promise.reject(new Error('secret URL')) : Promise.resolve(text),
	})
	fireEvent.change(screen.getByLabelText('Import OPML'), {
		target: { files: [file] },
	})
}
beforeEach(() => {
	state.user = { id: 'a', type: 'admin' }
	state.generation = 1
	state.api.mockReset()
	HTMLDialogElement.prototype.showModal = vi.fn()
	HTMLDialogElement.prototype.close = vi.fn()
	state.api.mockImplementation(async (_path, schema) =>
		schema.parse({
			feeds: [{ title: 'Local feed', feedUrl: 'http://127.0.0.1/feed' }],
		}),
	)
})
afterEach(cleanup)
it('parses on server, reviews native controls, starts background import with exact payload', async () => {
	render(<OpmlImport library={library} />)
	upload()
	await screen.findByText('1. Local feed')
	expect(state.api.mock.calls[0][0]).toBe('/api/podcasts/opml/parse')
	expect(JSON.parse(state.api.mock.calls[0][2].body)).toEqual({ opmlText: xml })
	expect(
		(screen.getByLabelText('Destination folder') as HTMLSelectElement).value,
	).toBe('folder')
	expect(
		(
			screen.getByLabelText(
				'Automatically download episodes',
			) as HTMLInputElement
		).checked,
	).toBe(false)
	state.api.mockImplementation(async (_path, schema) => schema.parse({})) // Shared api maps native plaintext OK to {}.
	fireEvent.click(screen.getByText('Add podcasts'))
	await screen.findByText(/Podcast import started/)
	expect(JSON.parse(state.api.mock.calls[1][2].body)).toEqual({
		feeds: ['http://127.0.0.1/feed'],
		folderId: 'folder',
		libraryId: 'podcasts',
		autoDownloadEpisodes: false,
	})
	expect(
		state.api.mock.calls.every((call) => call[0].startsWith('/api/')),
	).toBe(true)
})
it.each(['empty', 'malformed', 'read', 'request', 'url'] as const)(
	'handles %s without leaking server or feed errors',
	async (kind) => {
		if (kind === 'malformed')
			state.api.mockImplementation(async (_path, schema) =>
				schema.parse({ feeds: [] }),
			)
		if (kind === 'request')
			state.api.mockRejectedValue(
				new Error('https://secret:password@example.invalid'),
			)
		if (kind === 'url')
			state.api.mockImplementation(async (_path, schema) =>
				schema.parse({ feeds: [{ feedUrl: 'javascript:alert(1)' }] }),
			)
		render(<OpmlImport library={library} />)
		upload(kind === 'empty' ? '' : xml, kind === 'read')
		await screen.findByRole('alert')
		expect(screen.getByRole('alert').textContent).not.toContain('password')
		expect(screen.queryByText('Add podcasts')).toBeNull()
		expect(
			(screen.getByLabelText('Import OPML') as HTMLInputElement).disabled,
		).toBe(false)
	},
)
it('hides upload for nonadmins and book libraries without API calls', () => {
	state.user.type = 'user'
	const view = render(<OpmlImport library={library} />)
	expect(screen.queryByLabelText('Import OPML')).toBeNull()
	state.user.type = 'root'
	view.rerender(<OpmlImport library={{ ...library, mediaType: 'book' }} />)
	expect(screen.queryByLabelText('Import OPML')).toBeNull()
	expect(state.api).not.toHaveBeenCalled()
})
it('prevents duplicate import requests', async () => {
	render(<OpmlImport library={library} />)
	upload()
	await screen.findByText('1. Local feed')
	state.api.mockImplementation(() => new Promise(() => {}))
	const form = screen
		.getByText('Add podcasts')
		.closest('form') as HTMLFormElement
	fireEvent.submit(form)
	fireEvent.submit(form)
	expect(
		state.api.mock.calls.filter((call) => call[0].endsWith('/create')),
	).toHaveLength(1)
})
it.each(['user', 'library'] as const)(
	'discards pending parse after %s change',
	async (kind) => {
		let resolve: ((value: unknown) => void) | undefined
		state.api.mockImplementation(
			() =>
				new Promise((done) => {
					resolve = done
				}),
		)
		const view = render(<OpmlImport library={library} />)
		upload()
		await waitFor(() => expect(resolve).toBeTypeOf('function'))
		if (kind === 'user') {
			state.user = { id: 'b', type: 'admin' }
			state.generation++
		}
		view.rerender(
			<OpmlImport
				library={kind === 'library' ? { ...library, id: 'other' } : library}
			/>,
		)
		resolve?.({
			feeds: [{ title: 'Stale feed', feedUrl: 'http://localhost/feed' }],
		})
		await waitFor(() =>
			expect(
				(screen.getByLabelText('Import OPML') as HTMLInputElement).disabled,
			).toBe(false),
		)
		expect(screen.queryByText('Stale feed')).toBeNull()
		expect(state.api.mock.calls).toHaveLength(1)
	},
)
it('rejects credential URLs without fetching them', async () => {
	state.api.mockImplementation(async (_path, schema) =>
		schema.parse({ feeds: [{ feedUrl: 'http://user:pass@localhost/feed' }] }),
	)
	render(<OpmlImport library={library} />)
	upload()
	await screen.findByRole('alert')
	expect(state.api.mock.calls).toHaveLength(1)
})
it('cancels review when same-user session epoch changes', async () => {
	render(<OpmlImport library={library} />)
	upload()
	await screen.findByText('1. Local feed')
	state.generation++
	fireEvent.click(screen.getByText('Add podcasts'))
	expect(state.api.mock.calls).toHaveLength(1)
	expect(screen.queryByText('Add podcasts')).toBeNull()
})
it('reports create failure and permits retry without claiming completion', async () => {
	render(<OpmlImport library={library} />)
	upload()
	await screen.findByText('1. Local feed')
	state.api.mockRejectedValue(new Error('private feed URL'))
	fireEvent.click(screen.getByText('Add podcasts'))
	await screen.findAllByText(
		'Could not start podcast import. Retry or check server activity.',
	)
	expect((screen.getByText('Add podcasts') as HTMLButtonElement).disabled).toBe(
		false,
	)
	expect(screen.queryByText(/import started/)).toBeNull()
})
it('clears reviewed feeds after destination library changes', async () => {
	const view = render(<OpmlImport library={library} />)
	upload()
	await screen.findByText('1. Local feed')
	view.rerender(<OpmlImport library={{ ...library, id: 'other' }} />)
	expect(screen.queryByText('Add podcasts')).toBeNull()
	expect(state.api.mock.calls).toHaveLength(1)
})
it('resets file picker after read failure so same file can retry', async () => {
	render(<OpmlImport library={library} />)
	upload(xml, true)
	await screen.findByRole('alert')
	expect((screen.getByLabelText('Import OPML') as HTMLInputElement).value).toBe(
		'',
	)
	upload()
	await screen.findByText('1. Local feed')
})
