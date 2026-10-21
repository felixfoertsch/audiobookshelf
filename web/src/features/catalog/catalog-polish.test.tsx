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
import { afterEach, expect, it } from 'vitest'
import { useAuth } from '../../api'
import { SidebarProvider } from '../../shared/components/ui/sidebar'
import {
	BrowsePage,
	EntryCard,
	HomePage,
	LibraryNameContext,
	LibraryNav,
} from './browse'
import { browseSearch, entrySchema } from './browse-api'

afterEach(cleanup)
async function show(component: React.ReactNode) {
	const root = createRootRoute({ component: () => component })
	const router = createRouter({
		routeTree: root,
		history: createMemoryHistory({ initialEntries: ['/'] }),
	})
	await router.load()
	render(<RouterProvider router={router} />)
}
const podcast = (count?: number) => ({
	id: 'show',
	mediaType: 'podcast' as const,
	media: {
		metadata: { title: 'Show title' },
		...(count === undefined ? {} : { numEpisodes: count }),
	},
})
it.each([undefined, 0, 489])(
	'keeps unknown count distinct from %s',
	async (count) => {
		await show(<EntryCard library="lib" entry={podcast(count)} />)
		if (count === undefined)
			expect(screen.queryByText(/\d+ episodes?/)).toBeNull()
		else expect(screen.getByText(`${count} episodes`)).toBeTruthy()
		expect(screen.queryByText('Item actions')).toBeNull()
	},
)
it('preserves recent audioFile duration through serializer schema and prioritizes episode identity', async () => {
	const entry = entrySchema.parse({
		...podcast(1),
		recentEpisode: {
			id: 'episode',
			title: 'Episode title',
			audioFile: { duration: 123 },
		},
	})
	await show(
		<HomePage
			library="lib"
			podcast
			data={[
				{
					id: 'new',
					label: 'Newest Episodes',
					type: 'episode',
					entities: [entry],
				},
			]}
		/>,
	)
	expect(
		screen.getByRole('heading', { level: 3, name: 'Episode title' }),
	).toBeTruthy()
	expect(screen.getByText('Show title')).toBeTruthy()
	expect(screen.getByText('00:02:03')).toBeTruthy()
	expect(screen.queryByText('00:00:00')).toBeNull()
})
it('separates library context from page title and links episode shelf to latest', async () => {
	await show(
		<LibraryNameContext value="Podcasts">
			<HomePage
				library="lib"
				podcast
				data={[
					{
						id: 'newest-episodes',
						label: 'Newest Episodes',
						type: 'episode',
						entities: [],
					},
				]}
			/>
		</LibraryNameContext>,
	)
	expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Home')
	expect(screen.getByText('Podcasts')).toBeTruthy()
	expect(
		screen.getByRole('link', { name: 'Newest Episodes' }).getAttribute('href'),
	).toBe('/library/lib/podcast/latest')
})
it('keeps episode cards to show identity and one duration line', async () => {
	await show(
		<EntryCard
			library="lib"
			entry={{
				...podcast(489),
				_type: 'episode',
				media: {
					...podcast(489).media,
					metadata: { title: 'Show title', author: 'Show author' },
				},
				recentEpisode: { id: 'ep', title: 'Episode title', duration: 123 },
			}}
		/>,
	)
	expect(screen.getByRole('heading', { name: 'Episode title' })).toBeTruthy()
	expect(screen.getByText('Show title')).toBeTruthy()
	expect(screen.getByText('00:02:03')).toBeTruthy()
	expect(screen.queryByText('Show author')).toBeNull()
	expect(screen.queryByText('489 episodes')).toBeNull()
})
it('omits unknown recent duration', async () => {
	await show(
		<EntryCard
			library="lib"
			entry={{
				...podcast(),
				recentEpisode: { id: 'episode', title: 'Episode title' },
			}}
		/>,
	)
	expect(screen.queryByText(/00:00:00/)).toBeNull()
})
it('uses singular entity counts', async () => {
	await show(
		<EntryCard
			library="lib"
			entry={{ id: 'author', name: 'Writer', numBooks: 1, _type: 'authors' }}
		/>,
	)
	expect(screen.getByText('1 book')).toBeTruthy()
})
it.each([false, true])(
	'limits browse controls for media type podcast=%s',
	async (podcast) => {
		await show(
			<BrowsePage
				library="lib"
				section=""
				podcast={podcast}
				search={browseSearch.parse({})}
				data={{ results: [], total: 0 }}
				filters={{}}
			/>,
		)
		fireEvent.click(screen.getByRole('button', { name: 'View options' }))
		expect(
			screen.queryByRole('option', { name: 'Author first last' }) !== null,
		).toBe(!podcast)
		expect(
			screen.queryByRole('option', { name: 'Podcast author' }) !== null,
		).toBe(podcast)
		expect(
			screen.queryByRole('option', { name: 'Not finished' }) !== null,
		).toBe(!podcast)
		expect(
			screen.getByRole('option', { name: 'Grid' }).getAttribute('value'),
		).toBe('grid')
	},
)
it('hides item-only controls on entity pages and labels sections', async () => {
	await show(
		<BrowsePage
			library="lib"
			section="authors"
			podcast={false}
			search={browseSearch.parse({ sort: 'numBooks' })}
			data={{ results: [], total: 0 }}
			filters={{}}
		/>,
	)
	expect(
		screen.getByRole('heading', { level: 1, name: 'Authors' }),
	).toBeTruthy()
	fireEvent.click(screen.getByRole('button', { name: 'View options' }))
	for (const name of ['Filter', 'View', 'Cover size', 'Group series'])
		expect(screen.queryByLabelText(name)).toBeNull()
	expect(screen.getByRole('option', { name: 'Book count' })).toBeTruthy()
	expect(screen.queryByRole('option', { name: 'Podcast author' })).toBeNull()
})
it.each(['root', 'admin', 'user'])(
	'groups podcast navigation for %s without granting admin tools',
	async (type) => {
		Object.defineProperty(window, 'matchMedia', {
			configurable: true,
			value: () => ({
				matches: false,
				addEventListener() {},
				removeEventListener() {},
			}),
		})
		useAuth.setState({
			user: {
				id: 'u',
				username: 'Listener',
				type,
				accessToken: 'test',
				permissions: { update: type === 'user' },
			},
		})
		await show(
			<SidebarProvider>
				<LibraryNav library="lib" podcast />
			</SidebarProvider>,
		)
		expect(screen.getByText('Discover')).toBeTruthy()
		expect(screen.getByRole('link', { name: 'Latest episodes' })).toBeTruthy()
		expect(screen.queryByRole('link', { name: 'Authors' })).toBeNull()
		expect(screen.queryByRole('link', { name: 'Add podcast' }) !== null).toBe(
			type !== 'user',
		)
		expect(
			screen.queryByRole('link', { name: 'Download queue' }) !== null,
		).toBe(type !== 'user')
		useAuth.setState({ user: null })
	},
)
it('keeps legacy query controls truthful without offering them as normal choices', async () => {
	const filter = `missing.${btoa('cover')}`
	await show(
		<BrowsePage
			library="lib"
			section=""
			podcast
			search={browseSearch.parse({ sort: 'media.duration', filter })}
			data={{ results: [], total: 0 }}
			filters={{}}
		/>,
	)
	fireEvent.click(screen.getByRole('button', { name: 'View options' }))
	expect(
		(screen.getByLabelText('Sort') as HTMLSelectElement).selectedOptions[0]
			.textContent,
	).toBe('Current sort: Duration')
	expect(
		(screen.getByLabelText('Filter') as HTMLSelectElement).selectedOptions[0]
			.textContent,
	).toBe('Current filter: Missing metadata · Cover')
	expect(
		screen
			.getByRole('option', { name: 'Current sort: Duration' })
			.hasAttribute('disabled'),
	).toBe(true)
})

it('restores selected legacy query labels on reload and history back', async () => {
	const filter = `missing.${btoa('cover')}`
	const root = createRootRoute()
	const route = createRoute({
		getParentRoute: () => root,
		path: '/library/$library/bookshelf',
		validateSearch: browseSearch.parse,
		component: () => (
			<BrowsePage
				library="lib"
				section=""
				podcast
				search={route.useSearch()}
				data={{ results: [], total: 0 }}
				filters={{}}
			/>
		),
	})
	const history = createMemoryHistory({
		initialEntries: [
			`/library/lib/bookshelf?sort=media.duration&filter=${encodeURIComponent(filter)}`,
		],
	})
	const router = createRouter({ routeTree: root.addChildren([route]), history })
	await router.load()
	render(<RouterProvider router={router} />)
	fireEvent.click(screen.getByRole('button', { name: 'View options' }))
	const selected = () =>
		(screen.getByLabelText('Sort') as HTMLSelectElement).selectedOptions[0]
			.textContent
	expect(selected()).toBe('Current sort: Duration')
	fireEvent.change(screen.getByLabelText('Sort'), {
		target: { value: 'addedAt' },
	})
	await waitFor(() => expect(router.state.location.search.sort).toBe('addedAt'))
	expect(router.state.location.search.filter).toBe(filter)
	history.back()
	await waitFor(() => expect(selected()).toBe('Current sort: Duration'))
	await router.load()
	expect(selected()).toBe('Current sort: Duration')
	expect((screen.getByLabelText('Filter') as HTMLSelectElement).value).toBe(
		filter,
	)
})
