import { createFileRoute } from '@tanstack/react-router'
import { PodcastSearch } from '../features/podcast'
export const Route = createFileRoute('/library/$library/podcast/search')({
	component: Page,
})
function Page() {
	const { library } = Route.useParams()
	return <PodcastSearch libraryId={library} />
}
