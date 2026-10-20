import { createFileRoute } from '@tanstack/react-router'
import { PlaylistDetail } from '../features/catalog/entities'
import { getPlaylist } from '../features/catalog/entities-api'
export const Route = createFileRoute('/playlist/$id')({
	loader: ({ params }) => getPlaylist(params.id),
	component: () => <PlaylistDetail playlist={Route.useLoaderData()} />,
})
