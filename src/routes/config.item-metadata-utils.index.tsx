import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/config/item-metadata-utils/')({
	component: MetadataIndex,
})
function MetadataIndex() {
	return (
		<section className="space-y-3">
			<h1 className="text-2xl">Item metadata utilities</h1>
			{[
				['Tags', '/config/item-metadata-utils/tags'],
				['Genres', '/config/item-metadata-utils/genres'],
				[
					'Custom metadata providers',
					'/config/item-metadata-utils/custom-metadata-providers',
				],
			].map(([label, to]) => (
				<Link
					key={to}
					to={to}
					className="block rounded-md border p-4 hover:bg-accent"
				>
					{label} →
				</Link>
			))}
		</section>
	)
}
