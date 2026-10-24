import { createFileRoute } from '@tanstack/react-router'
import { Logs } from '../features/admin/logs'
export const Route = createFileRoute('/config/log')({ component: Logs })
