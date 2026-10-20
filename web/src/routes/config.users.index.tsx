import { createFileRoute } from '@tanstack/react-router'
import { UsersPage } from '../features/admin/users'
export const Route = createFileRoute('/config/users/')({ component: UsersPage })
