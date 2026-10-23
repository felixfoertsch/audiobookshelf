import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { api, useAuth } from '../../api'
import { SeriesPage } from './browse'

vi.mock('../../api', async (load) => ({
	...(await load<typeof import('../../api')>()),
	api: vi.fn(),
}))
const router = vi.hoisted(() => ({ invalidate: vi.fn() }))
vi.mock('@tanstack/react-router', () => ({
	useRouter: () => router,
	Link: ({ children }: { children: React.ReactNode }) => (
		<span>{children}</span>
	),
}))
afterEach(() => {
	cleanup()
	vi.restoreAllMocks()
	router.invalidate.mockReset()
	useAuth.getState().set(null)
})
const data = {
	id: 'series/id',
	name: 'Series',
	description: '',
	books: [],
} as never
it('re-adds series and invalidates data', async () => {
	vi.mocked(api).mockResolvedValueOnce(undefined as never)
	render(<SeriesPage library="lib" data={data} />)
	fireEvent.click(
		screen.getByRole('button', { name: 'Re-add series to continue listening' }),
	)
	await waitFor(() =>
		expect(api).toHaveBeenCalledWith(
			'/api/me/series/series%2Fid/readd-to-continue-listening',
			expect.anything(),
		),
	)
	await waitFor(() => expect(router.invalidate).toHaveBeenCalled())
})
it('confirms finished state and sends progress updates for every book', async () => {
	vi.spyOn(window, 'confirm').mockReturnValue(true)
	vi.mocked(api).mockResolvedValueOnce(undefined as never)
	render(<SeriesPage library="lib" data={data} />)
	fireEvent.click(screen.getByRole('button', { name: 'Mark series finished' }))
	await waitFor(() =>
		expect(api).toHaveBeenCalledWith(
			'/api/me/progress/batch/update',
			expect.anything(),
			expect.objectContaining({ method: 'PATCH', body: JSON.stringify([]) }),
		),
	)
})
