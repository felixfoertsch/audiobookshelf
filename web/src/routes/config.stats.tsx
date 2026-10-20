import { createFileRoute } from '@tanstack/react-router'
import { Stats } from '../features/admin/stats'
export const Route = createFileRoute('/config/stats')({ component: Stats })
