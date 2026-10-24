import { createFileRoute } from '@tanstack/react-router'
import { SettingsPage } from '../features/admin/settings'
import { ServerActivity } from '../features/catalog/server-activity'

function ConfigPage() {
	return (
		<>
			<SettingsPage />
			<section className="mt-8 border-t pt-6">
				<h2 className="mb-4 text-xl font-semibold">Server</h2>
				<ServerActivity />
			</section>
		</>
	)
}

export const Route = createFileRoute('/config/')({ component: ConfigPage })
