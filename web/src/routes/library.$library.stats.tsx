import { createFileRoute } from '@tanstack/react-router'
import { StatsPage } from '../features/catalog/browse'
import { loadStats } from '../features/catalog/browse-api'
export const Route = createFileRoute('/library/$library/stats')({
	loader: async ({ params }) => {
		return loadStats(params.library)
	},
	component: Page,
})
function Page() {
	const { library } = Route.useParams()
	const data = Route.useLoaderData()
	return <StatsPage library={library} data={data} />
}
