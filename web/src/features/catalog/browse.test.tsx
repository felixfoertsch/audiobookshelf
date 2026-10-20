import {
	createMemoryHistory,
	createRootRoute,
	createRouter,
	RouterProvider,
} from '@tanstack/react-router'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SidebarProvider } from '../../shared/components/ui/sidebar'
import { LibraryNav } from './browse'
import {
	browsePath,
	browseSearch,
	encodeFilter,
	entrySchema,
	searchSchema,
} from './browse-api'

describe('canonical library contracts', () => {
	it('retains old query semantics and encodes filter values for server decoder', () => {
		const query = browseSearch.parse({
			page: '2',
			desc: '1',
			filter: `genres.${encodeFilter('Science fiction')}`,
			view: 'detail',
		})
		const url = new URL(
			browsePath('lib/one', '', query),
			'https://example.test',
		)
		expect(url.pathname).toBe('/api/libraries/lib%2Fone/items')
		expect(url.searchParams.get('page')).toBe('2')
		expect(url.searchParams.get('desc')).toBe('1')
		expect(atob((url.searchParams.get('filter') ?? '').split('.')[1])).toBe(
			'Science fiction',
		)
	})
	it('validates serialized non-item search categories', () => {
		const result = searchSchema.parse({
			series: [
				{ series: { id: 'series', name: null, description: null }, books: [] },
			],
			narrators: [{ name: 'Narrator', numBooks: 3 }],
			tags: [{ name: 'Tag', numItems: 4 }],
			authors: [],
		})
		expect(result.series?.[0].id).toBe('series')
		expect(result.narrators?.[0].numBooks).toBe(3)
		expect(searchSchema.safeParse({ narrators: ['wrong shape'] }).success).toBe(
			false,
		)
		expect(entrySchema.safeParse({ id: 'broken', media: null }).success).toBe(
			false,
		)
	})
	it('renders original book navigation paths without alternate plural taxonomy', async () => {
		const root = createRootRoute({
			component: () => (
				<SidebarProvider>
					<LibraryNav library="lib" />
				</SidebarProvider>
			),
		})
		const router = createRouter({
			routeTree: root,
			history: createMemoryHistory({ initialEntries: ['/'] }),
		})
		await router.load()
		const html = renderToStaticMarkup(<RouterProvider router={router} />)
		for (const path of [
			'/library/lib',
			'/library/lib/bookshelf',
			'/library/lib/bookshelf/series',
			'/library/lib/bookshelf/authors',
			'/library/lib/bookshelf/collections',
			'/library/lib/bookshelf/playlists',
			'/library/lib/narrators',
		])
			expect(html).toContain(path)
	})
})
