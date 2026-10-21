import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from '@tanstack/react-router'
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { getAuthGeneration, useAuth } from '../../api'
import { refreshProgress } from '../item/progress'

vi.mock('../item/progress', () => ({
	episodeProgress: (
		user: { mediaProgress?: unknown[] } | null,
		id: string,
		episodeId?: string,
	) =>
		user?.mediaProgress?.find((entry) => {
			const progress = entry as {
				libraryItemId: string
				episodeId?: string
				isFinished?: boolean
			}
			return progress.libraryItemId === id && progress.episodeId === episodeId
		}),
	refreshProgress: vi.fn(),
}))

import { BrowsePage, updateSelectedProgress } from './browse'
import { browseSearch } from './browse-api'

const service = vi.hoisted(() => ({
	getItem: vi.fn(),
	writeProgress: vi.fn(),
}))
vi.mock('../item/service', () => service)
afterEach(() => {
	cleanup()
	useAuth.setState({ user: null })
	vi.clearAllMocks()
})
const entry = {
	id: 'pod',
	mediaType: 'podcast' as const,
	media: { metadata: { title: 'Show' }, coverPath: '/cover', episodes: [] },
}
async function setup() {
	useAuth.setState({
		user: { id: 'user', username: 'User', type: 'user', accessToken: 'token' },
	})
	const root = createRootRoute({
		component: () => (
			<BrowsePage
				library="lib"
				section=""
				podcast
				search={browseSearch.parse({})}
				data={{ results: [entry], total: 1 }}
				filters={{}}
			/>
		),
	})
	const route = createRoute({
		getParentRoute: () => root,
		path: '/',
		component: () => <div />,
	})
	const router = createRouter({
		routeTree: root.addChildren([route]),
		history: createMemoryHistory({ initialEntries: ['/'] }),
	})
	await router.load()
	render(<RouterProvider router={router} />)
	return router
}
it('starts without selection controls; Select shows compact count only; More actions opens all bulk progress actions; Done clears', async () => {
	await setup()
	expect(screen.queryByRole('checkbox')).toBeNull()
	expect(
		screen.queryByRole('button', { name: 'Mark all episodes finished' }),
	).toBeNull()
	fireEvent.click(screen.getByRole('button', { name: 'Select' }))
	expect(screen.getByText('0 selected')).toBeTruthy()
	expect(
		screen.queryByRole('button', { name: 'Mark all episodes finished' }),
	).toBeNull()
	fireEvent.click(screen.getByRole('checkbox', { name: 'Select Show' }))
	expect(screen.getByText('1 selected')).toBeTruthy()
	expect(
		screen.queryByRole('button', { name: 'Mark all episodes finished' }),
	).toBeNull()
	fireEvent.click(screen.getAllByRole('button', { name: 'More actions' })[0])
	expect(
		screen.getByRole('button', { name: 'Mark all episodes finished' }),
	).toBeTruthy()
	expect(
		screen.getByRole('button', { name: 'Mark all episodes unfinished' }),
	).toBeTruthy()
	fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[0])
	fireEvent.click(screen.getByRole('button', { name: 'Done' }))
	expect(screen.queryByRole('checkbox')).toBeNull()
	expect(screen.getByRole('button', { name: 'Select' })).toBeTruthy()
})
it('cover and title share item navigation', async () => {
	await setup()
	const link = screen.getByRole('link', { name: 'Show' })
	expect(link.getAttribute('href')).toBe('/item/pod')
	expect(link.querySelector('img')).toBeTruthy()
})
it('stops after second write fails and retains committed result without rollback', async () => {
	useAuth.setState({
		user: { id: 'user', username: 'User', type: 'user', accessToken: 'token' },
	})
	service.getItem.mockResolvedValue({
		media: { episodes: [{ id: 'ep1' }, { id: 'ep2' }, { id: 'ep3' }] },
	})
	service.writeProgress
		.mockResolvedValueOnce({})
		.mockRejectedValueOnce(new Error('write failed'))
	await expect(
		updateSelectedProgress(['pod'], true, true, {
			owner: 'user',
			generation: getAuthGeneration(),
			isActive: () => true,
			onProgress: () => {},
		}),
	).resolves.toMatchObject({
		written: 1,
		failed: 1,
		remaining: 1,
		error: 'write failed',
	})
	expect(service.writeProgress.mock.calls).toEqual([
		['pod', { isFinished: true }, 'ep1'],
		['pod', { isFinished: true }, 'ep2'],
	])
})
it('skips canonical no-op progress and preserves in-progress entries', async () => {
	useAuth.setState({
		user: {
			id: 'user',
			username: 'User',
			type: 'user',
			accessToken: 'token',
			mediaProgress: [
				{ libraryItemId: 'pod', episodeId: 'finished', isFinished: true },
				{
					libraryItemId: 'pod',
					episodeId: 'started',
					isFinished: false,
					currentTime: 30,
				},
			],
		},
	})
	service.getItem.mockResolvedValue({
		media: { episodes: [{ id: 'finished' }, { id: 'started' }] },
	})
	await updateSelectedProgress(['pod'], true, true, {
		owner: 'user',
		generation: getAuthGeneration(),
		isActive: () => true,
		onProgress: () => {},
	})
	expect(service.writeProgress.mock.calls).toEqual([
		['pod', { isFinished: true }, 'started'],
	])
	expect(refreshProgress).toHaveBeenCalledTimes(2)
})
it('stops writes when account owner changes between requests', async () => {
	useAuth.setState({
		user: { id: 'user', username: 'User', type: 'user', accessToken: 'token' },
	})
	service.getItem.mockResolvedValue({
		media: { episodes: [{ id: 'ep1' }, { id: 'ep2' }] },
	})
	service.writeProgress.mockImplementation(async () => {
		useAuth.setState({
			user: {
				id: 'other',
				username: 'Other',
				type: 'user',
				accessToken: 'token',
			},
		})
	})
	await updateSelectedProgress(['pod'], true, true, {
		owner: 'user',
		generation: getAuthGeneration(),
		isActive: () => true,
		onProgress: () => {},
	})
	expect(service.writeProgress).toHaveBeenCalledTimes(1)
})
it('marks every podcast episode through exact episode-specific progress payload sequentially', async () => {
	useAuth.setState({
		user: { id: 'user', username: 'User', type: 'user', accessToken: 'token' },
	})
	service.getItem.mockResolvedValue({
		media: { episodes: [{ id: 'ep1' }, { id: 'ep2' }] },
	})
	service.writeProgress.mockResolvedValue({})
	await updateSelectedProgress(['pod'], true, true, {
		owner: 'user',
		generation: getAuthGeneration(),
		isActive: () => true,
		onProgress: () => {},
	})
	expect(service.getItem).toHaveBeenCalledWith('pod')
	expect(service.writeProgress.mock.calls).toEqual([
		['pod', { isFinished: true }, 'ep1'],
		['pod', { isFinished: true }, 'ep2'],
	])
})
it('cancel stops later writes and counts episode targets, not shows', async () => {
	useAuth.setState({
		user: { id: 'user', username: 'User', accessToken: 'token' },
	})
	let active = true
	service.getItem.mockResolvedValue({
		media: { episodes: [{ id: 'one' }, { id: 'two' }] },
	})
	service.writeProgress.mockImplementation(async () => {
		active = false
	})
	await expect(
		updateSelectedProgress(['pod'], true, true, {
			owner: 'user',
			generation: getAuthGeneration(),
			isActive: () => active,
			onProgress: () => {},
		}),
	).resolves.toMatchObject({ written: 1, remaining: 1, cancelled: true })
	expect(service.writeProgress).toHaveBeenCalledTimes(1)
})
it('successful action closes sheet before reselection', async () => {
	await setup()
	service.getItem.mockResolvedValue({ media: { episodes: [] } })
	fireEvent.click(screen.getByRole('button', { name: 'Select' }))
	fireEvent.click(screen.getByRole('checkbox', { name: 'Select Show' }))
	fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
	fireEvent.click(
		screen.getByRole('button', { name: 'Mark all episodes finished' }),
	)
	await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
	fireEvent.click(screen.getByRole('checkbox', { name: 'Select Show' }))
	expect(screen.queryByRole('dialog')).toBeNull()
})
it('mark unfinished skips absent and already-unfinished rows without resetting resume', async () => {
	useAuth.setState({
		user: {
			id: 'user',
			username: 'User',
			accessToken: 'token',
			mediaProgress: [
				{
					libraryItemId: 'pod',
					episodeId: 'started',
					isFinished: false,
					currentTime: 30,
				},
				{ libraryItemId: 'pod', episodeId: 'done', isFinished: true },
			],
		},
	})
	service.getItem.mockResolvedValue({
		media: { episodes: [{ id: 'new' }, { id: 'started' }, { id: 'done' }] },
	})
	service.writeProgress.mockResolvedValue({})
	await expect(
		updateSelectedProgress(['pod'], true, false, {
			owner: 'user',
			generation: getAuthGeneration(),
			isActive: () => true,
			onProgress: () => {},
		}),
	).resolves.toMatchObject({ written: 1, skipped: 2, remaining: 0 })
	expect(service.writeProgress.mock.calls).toEqual([
		['pod', { isFinished: false }, 'done'],
	])
})
it('refreshes stale progress before skip decisions and confirms lossy unfinished before any write', async () => {
	useAuth.setState({
		user: {
			id: 'user',
			username: 'User',
			accessToken: 'token',
			mediaProgress: [],
		},
	})
	vi.mocked(refreshProgress).mockImplementationOnce(async () => {
		useAuth.setState({
			user: {
				...{ id: 'user', username: 'User', accessToken: 'token' },
				...useAuth.getState().user,
				mediaProgress: [
					{
						libraryItemId: 'pod',
						episodeId: 'done',
						isFinished: true,
						currentTime: 30,
					},
				],
			},
		})
	})
	service.getItem.mockResolvedValue({ media: { episodes: [{ id: 'done' }] } })
	const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
	const result = await updateSelectedProgress(['pod'], true, false, {
		owner: 'user',
		generation: getAuthGeneration(),
		isActive: () => true,
		onProgress: () => {},
	})
	expect(result.cancelled).toBe(true)
	expect(confirm).toHaveBeenCalledWith(expect.stringContaining('1 finished'))
	expect(service.writeProgress).not.toHaveBeenCalled()
	confirm.mockRestore()
})
it('aborts before mutations when canonical prefetch fails or reports dropped records', async () => {
	useAuth.setState({
		user: { id: 'user', username: 'User', accessToken: 'token' },
	})
	vi.mocked(refreshProgress).mockRejectedValueOnce(new Error('offline'))
	const options = {
		owner: 'user',
		generation: getAuthGeneration(),
		isActive: () => true,
		onProgress: () => {},
	}
	await expect(
		updateSelectedProgress(['pod'], true, false, options),
	).rejects.toThrow('Could not verify listening status')
	useAuth.setState({
		user: {
			...{ id: 'user', username: 'User', accessToken: 'token' },
			...useAuth.getState().user,
			progressWarning: 'invalid row',
		},
	})
	await expect(
		updateSelectedProgress(['pod'], true, false, options),
	).rejects.toThrow('Could not verify listening status')
	expect(service.writeProgress).not.toHaveBeenCalled()
})
it('coalesces slow batch progress events into one final catalog invalidation', async () => {
	const router = await setup()
	const invalidate = vi.spyOn(router, 'invalidate').mockResolvedValue()
	const send = (name: string, detail: unknown) =>
		window.dispatchEvent(new CustomEvent(name, { detail }))
	send('abs:progress-batch', { active: true, owner: 'user' })
	for (let index = 0; index < 3; index++) {
		send('abs:progress-changed', { libraryItemId: 'pod' })
		send('abs:socket', { event: 'user_updated', payload: { id: 'user' } })
		send('abs:socket', { event: 'user_item_progress_updated', payload: {} })
		await new Promise((resolve) => setTimeout(resolve, 100))
	}
	expect(invalidate).not.toHaveBeenCalled()
	send('abs:progress-batch', { active: false, owner: 'user' })
	await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1))
})
