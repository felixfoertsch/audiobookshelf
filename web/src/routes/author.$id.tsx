import { createFileRoute } from '@tanstack/react-router'
import { AuthorDetail } from '../features/catalog/entities'
import { getAuthor } from '../features/catalog/entities-api'
export const Route = createFileRoute('/author/$id')({
	loader: ({ params }) => getAuthor(params.id),
	component: () => <AuthorDetail author={Route.useLoaderData()} />,
})
