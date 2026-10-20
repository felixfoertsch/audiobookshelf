import { createFileRoute } from '@tanstack/react-router'
import { SettingsPage } from '../features/admin/settings'

export const Route = createFileRoute('/config/')({ component: SettingsPage })
