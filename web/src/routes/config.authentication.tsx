import { createFileRoute } from '@tanstack/react-router'
import { AuthenticationPage } from '../features/admin/authentication'

export const Route = createFileRoute('/config/authentication')({
	component: AuthenticationPage,
})
