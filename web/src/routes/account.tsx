import { createFileRoute } from '@tanstack/react-router'
import { Account } from '../features/account'
import { UserSettingsNav } from '../shared/settings-nav'

export const Route = createFileRoute('/account')({
	component: () => (
		<div className="space-y-6">
			<h1 className="text-2xl font-semibold">User settings</h1>
			<UserSettingsNav />
			<Account />
		</div>
	),
})
