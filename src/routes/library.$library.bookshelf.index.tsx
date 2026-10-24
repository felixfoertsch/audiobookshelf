import { createFileRoute, type SearchSchemaInput } from '@tanstack/react-router'
import { getLibraries } from '../catalog'
import { BrowsePage } from '../features/catalog/browse'
import { loadBrowse, loadFilters } from '../features/catalog/browse-api'
import {
	type BrowseSearchInput,
	podcastSearch,
	preferredSearch,
} from '../features/catalog/preferences'
export const Route = createFileRoute('/library/$library/bookshelf/')({
	validateSearch: (input: SearchSchemaInput & BrowseSearchInput) =>
		preferredSearch(input),
	loaderDeps: ({ search }) => search,
	loader: async ({ params, deps }) => {
		const { libraries } = await getLibraries()
		const effectiveSearch =
			libraries.find((library) => library.id === params.library)?.mediaType ===
			'podcast'
				? podcastSearch(deps)
				: deps
		const [data, filters] = await Promise.all([
			loadBrowse(params.library, '', effectiveSearch),
			loadFilters(params.library),
		])
		return {
			effectiveSearch,
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
			section=""
			search={data.effectiveSearch}
			{...data}
		/>
	)
}
