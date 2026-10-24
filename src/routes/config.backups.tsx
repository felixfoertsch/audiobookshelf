import { createFileRoute } from '@tanstack/react-router'
import { Backups } from '../features/admin/backups'
export const Route = createFileRoute('/config/backups')({ component: Backups })
