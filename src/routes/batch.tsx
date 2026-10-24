import { createFileRoute } from '@tanstack/react-router'
import { BatchPage, batchSearch } from '../features/batch'
export const Route = createFileRoute('/batch')({
	validateSearch: batchSearch,
	component: BatchRoute,
})
function BatchRoute() {
	const { ids } = Route.useSearch()
	return <BatchPage ids={ids} />
}
