import { createFileRoute } from '@tanstack/react-router'
import { BookManage } from '../features/item/BookManage'
export const Route = createFileRoute('/audiobook/$id/chapters')({
	component: Chapters,
})
function Chapters() {
	const { id } = Route.useParams()
	return <BookManage id={id} section="chapters" />
}
