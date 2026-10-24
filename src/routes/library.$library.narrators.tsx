import { createFileRoute, redirect } from '@tanstack/react-router'
import { getLibraries } from '../catalog'
import { NarratorsPage } from '../features/catalog/browse'
import { loadNarrators } from '../features/catalog/browse-api'
export const Route = createFileRoute('/library/$library/narrators')({
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
		return loadNarrators(params.library)
	},
	component: Page,
})
function Page() {
	const { library } = Route.useParams()
	const data = Route.useLoaderData()
	return <NarratorsPage library={library} data={data} />
}
