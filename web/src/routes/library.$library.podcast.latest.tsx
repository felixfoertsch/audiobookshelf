import { createFileRoute } from '@tanstack/react-router'
import { PodcastLatest } from '../features/podcast'
export const Route = createFileRoute('/library/$library/podcast/latest')({
	component: Page,
})
function Page() {
	const { library } = Route.useParams()
	return <PodcastLatest libraryId={library} />
}
