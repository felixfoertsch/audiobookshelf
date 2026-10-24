import { createFileRoute } from '@tanstack/react-router'
import { Notifications } from '../features/admin/notifications'
export const Route = createFileRoute('/config/notifications')({
	component: Notifications,
})
