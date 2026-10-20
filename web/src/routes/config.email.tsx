import { createFileRoute } from '@tanstack/react-router'
import { Email } from '../features/admin/email'
export const Route = createFileRoute('/config/email')({ component: Email })
