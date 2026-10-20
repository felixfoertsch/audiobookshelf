import { createFileRoute } from '@tanstack/react-router'
import { CollectionDetail } from '../features/catalog/entities'
import { getCollection } from '../features/catalog/entities-api'
export const Route = createFileRoute('/collection/$id')({
	loader: ({ params }) => getCollection(params.id),
	component: () => <CollectionDetail collection={Route.useLoaderData()} />,
})
