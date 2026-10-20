import { createFileRoute } from '@tanstack/react-router'
import { UserPage } from '../features/admin/users'
export const Route = createFileRoute('/config/users/$id/')({
	component: UserPage,
})
