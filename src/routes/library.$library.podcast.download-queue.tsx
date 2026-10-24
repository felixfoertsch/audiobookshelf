import { createFileRoute } from '@tanstack/react-router'
import { PodcastDownloadQueue } from '../features/podcast'
export const Route = createFileRoute(
	'/library/$library/podcast/download-queue',
)({ component: Page })
function Page() {
	const { library } = Route.useParams()
	return <PodcastDownloadQueue libraryId={library} />
}
