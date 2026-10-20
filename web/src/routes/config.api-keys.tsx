import { createFileRoute } from '@tanstack/react-router'
import { ApiKeysPage } from '../features/admin/api-keys'
export const Route = createFileRoute('/config/api-keys')({
	component: ApiKeysPage,
})
