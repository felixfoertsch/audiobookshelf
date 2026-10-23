import { createFileRoute } from '@tanstack/react-router'
import { HomePage } from '../features/catalog/browse'
import { loadHome } from '../features/catalog/browse-api'
import { PodcastSearchModal } from '../features/podcast/PodcastSearchModal'
export const Route = createFileRoute('/library/$library/podcast/search')({
	loader: ({ params }) => loadHome(params.library),
	component: Page,
})
function Page() {
	const { library } = Route.useParams()
	const data = Route.useLoaderData()
	return (
		<>
			<HomePage library={library} data={data} podcast />
			<PodcastSearchModal libraryId={library} />
		</>
	)
}
