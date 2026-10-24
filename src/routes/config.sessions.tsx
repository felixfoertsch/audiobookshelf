import { createFileRoute } from '@tanstack/react-router'
import { SessionsPage } from '../features/admin/users'
export const Route = createFileRoute('/config/sessions')({
	component: SessionsPage,
})
