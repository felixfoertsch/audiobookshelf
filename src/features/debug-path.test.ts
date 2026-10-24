import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
} from '@tanstack/react-router'
import { expect, it } from 'vitest'

it('native router exposes canonical pathname below both modern mounts', () => {
	for (const basepath of ['/new', '/abs/new']) {
		const root = createRootRoute()
		const route = createRoute({ getParentRoute: () => root, path: '/item/$id' })
		const router = createRouter({
			routeTree: root.addChildren([route]),
			basepath,
			history: createMemoryHistory({
				initialEntries: [`${basepath}/item/book-1`],
			}),
		})
		expect(router.state.location.pathname).toBe('/item/book-1')
	}
})
