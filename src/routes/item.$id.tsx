import { createFileRoute } from '@tanstack/react-router'
import { ItemView } from '../features/item/ItemView'
export const Route = createFileRoute('/item/$id')({ component: ItemPage })
function ItemPage() {
	const { id } = Route.useParams()
	return <ItemView id={id} />
}
