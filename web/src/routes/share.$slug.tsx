import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { SharePlayer } from '../features/share/share'
export const Route = createFileRoute('/share/$slug')({
	validateSearch: z.object({
		t: z.coerce.number().finite().nonnegative().optional().catch(undefined),
	}),
	component: Share,
})
function Share() {
	const { slug } = Route.useParams()
	const { t } = Route.useSearch()
	return <SharePlayer slug={slug} time={t} />
}
