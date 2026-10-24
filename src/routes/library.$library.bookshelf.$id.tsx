import {
	createFileRoute,
	redirect,
	type SearchSchemaInput,
} from '@tanstack/react-router'
import { getLibraries } from '../catalog'
import { BrowsePage } from '../features/catalog/browse'
import { loadBrowse, loadFilters } from '../features/catalog/browse-api'
import {
	type BrowseSearchInput,
	preferredSearch,
} from '../features/catalog/preferences'
export const Route = createFileRoute('/library/$library/bookshelf/$id')({
	validateSearch: (input: SearchSchemaInput & BrowseSearchInput) =>
		preferredSearch(input, window.location.pathname.split('/').pop() || ''),
	loaderDeps: ({ search }) => search,
	loader: async ({ params, deps }) => {
		if (!['series', 'authors', 'collections', 'playlists'].includes(params.id))
			throw new Error('Unknown bookshelf')
		const { libraries } = await getLibraries()
		if (
			libraries.find((item) => item.id === params.library)?.mediaType ===
				'podcast' &&
			params.id !== 'playlists'
		)
			throw redirect({
				to: '/library/$library',
				params: { library: params.library },
			})
		const [data, filters] = await Promise.all([
			loadBrowse(params.library, params.id, deps),
			loadFilters(params.library),
		])
		return {
			data,
			filters,
			podcast:
				libraries.find((l) => l.id === params.library)?.mediaType === 'podcast',
		}
	},
	component: Page,
})
function Page() {
	const { library } = Route.useParams()
	const data = Route.useLoaderData()
	return (
		<BrowsePage
			library={library}
			section={Route.useParams().id}
			search={Route.useSearch()}
			{...data}
		/>
	)
}
