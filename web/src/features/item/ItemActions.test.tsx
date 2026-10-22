import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ItemActions } from './ItemActions'
import type { Item } from './schemas'

const mocks = vi.hoisted(() => ({
	user: { id: 'listener', type: 'user', permissions: {} },
}))
vi.mock('../../api', () => ({
	useAuth: (select: (state: typeof mocks) => unknown) => select(mocks),
	api: vi.fn(),
}))
afterEach(() => {
	cleanup()
	mocks.user.type = 'user'
	vi.unstubAllGlobals()
})
const item = {
	id: 'show',
	mediaType: 'podcast',
	media: { metadata: { title: 'Show' } },
} as Item
it('restricted listener has no empty actions section', () => {
	render(<ItemActions item={item} onChanged={() => {}} />)
	expect(screen.queryByRole('region', { name: 'Item actions' })).toBeNull()
})
it('restricted listener retains ebook file information', () => {
	render(
		<ItemActions
			item={
				{
					...item,
					libraryFiles: [
						{
							ino: 'file',
							fileType: 'ebook',
							metadata: { filename: 'Guide.epub' },
						},
					],
				} as Item
			}
			onChanged={() => {}}
		/>,
	)
	expect(screen.getByText(/Guide.epub/)).toBeTruthy()
	expect(screen.queryByText('Download')).toBeNull()
})
it('sharing draft survives Escape and return, with native validation intact', async () => {
	mocks.user.type = 'admin'
	render(
		<ItemActions
			item={{
				...item,
				mediaType: 'book',
				media: { ...item.media, id: 'book' },
			}}
			onChanged={() => {}}
		/>,
	)
	fireEvent.click(screen.getByRole('button', { name: 'Sharing' }))
	fireEvent.change(screen.getByLabelText('Slug'), {
		target: { value: 'draft-slug' },
	})
	fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
	await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
	fireEvent.click(screen.getByRole('button', { name: 'Sharing' }))
	expect(screen.getByLabelText('Slug')).toHaveProperty('value', 'draft-slug')
	fireEvent.change(screen.getByLabelText('Slug'), {
		target: { value: 'bad slug' },
	})
	expect(
		screen.getByRole('button', { name: 'Create and copy share' }),
	).toHaveProperty('disabled', true)
	mocks.user.type = 'user'
})
it('RSS copy failure explains manual fallback without changing feed', async () => {
	mocks.user.type = 'admin'
	vi.stubGlobal('navigator', {
		clipboard: {
			writeText: vi.fn().mockRejectedValue(new Error('Clipboard blocked')),
		},
	})
	render(
		<ItemActions
			item={{ ...item, rssFeed: { id: 'feed', feedUrl: '/feed/show' } } as Item}
			onChanged={() => {}}
		/>,
	)
	fireEvent.click(screen.getByRole('button', { name: /^RSS feed$/ }))
	fireEvent.click(screen.getByRole('button', { name: 'Copy feed URL' }))
	await waitFor(() =>
		expect(screen.getByRole('dialog').textContent).toContain(
			'Could not copy feed URL. Select the URL above and copy it manually.',
		),
	)
})
