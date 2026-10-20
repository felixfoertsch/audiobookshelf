import { createFileRoute } from '@tanstack/react-router'
import { BookManage } from '../features/item/BookManage'
export const Route = createFileRoute('/audiobook/$id/edit')({ component: Edit })
function Edit() {
	const { id } = Route.useParams()
	return <BookManage id={id} section="edit" />
}
