import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { SearchPage } from '../features/catalog/browse'
import { searchLibrary } from '../features/catalog/browse-api'
export const Route = createFileRoute('/library/$library/search')({
	validateSearch: z.object({ q: z.string().max(200).catch('') }),
	loaderDeps: ({ search }) => search,
	loader: async ({ params, deps }) => {
		return searchLibrary(params.library, deps.q)
	},
	component: Page,
})
function Page() {
	const { library } = Route.useParams()
	const data = Route.useLoaderData()
	return <SearchPage library={library} q={Route.useSearch().q} data={data} />
}
