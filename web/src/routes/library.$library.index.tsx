import { createFileRoute } from '@tanstack/react-router'
import { getLibraries } from '../catalog'
import { HomePage } from '../features/catalog/browse'
import { loadHome } from '../features/catalog/browse-api'
export const Route = createFileRoute('/library/$library/')({
	loader: async ({ params }) => {
		const [data, { libraries }] = await Promise.all([
			loadHome(params.library),
			getLibraries(),
		])
		return {
			data,
			podcast:
				libraries.find((l) => l.id === params.library)?.mediaType === 'podcast',
		}
	},
	component: Page,
})
function Page() {
	const { library } = Route.useParams()
	const data = Route.useLoaderData()
	return <HomePage library={library} {...data} />
}
