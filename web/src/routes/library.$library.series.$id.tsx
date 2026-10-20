import { createFileRoute, redirect } from '@tanstack/react-router'
import { getLibraries } from '../catalog'
import { SeriesPage } from '../features/catalog/browse'
import { loadSeries } from '../features/catalog/browse-api'
export const Route = createFileRoute('/library/$library/series/$id')({
	loader: async ({ params }) => {
		const { libraries } = await getLibraries()
		if (
			libraries.find((library) => library.id === params.library)?.mediaType ===
			'podcast'
		)
			throw redirect({
				to: '/library/$library',
				params: { library: params.library },
			})
		return loadSeries(params.library, params.id)
	},
	component: Page,
})
function Page() {
	const { library } = Route.useParams()
	const data = Route.useLoaderData()
	return <SeriesPage library={library} data={data} />
}
