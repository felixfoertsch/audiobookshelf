import { createFileRoute } from '@tanstack/react-router'
import { BookManage } from '../features/item/BookManage'
export const Route = createFileRoute('/audiobook/$id/manage')({
	component: Manage,
})
function Manage() {
	const { id } = Route.useParams()
	return <BookManage id={id} section="manage" />
}
