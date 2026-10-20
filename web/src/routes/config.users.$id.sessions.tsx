import { createFileRoute } from '@tanstack/react-router'
import { UserSessionsPage } from '../features/admin/users'
export const Route = createFileRoute('/config/users/$id/sessions')({
	component: UserSessionsPage,
})
