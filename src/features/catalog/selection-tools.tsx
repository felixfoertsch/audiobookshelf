import { useEffect, useState } from 'react'
import { z } from 'zod'
import { api, apiBinary, useAuth } from '../../api'
import { Button } from '../../shared/components/ui/button'

export const quickMatchOptions = z.object({
	provider: z.string().min(1),
	overrideCover: z.boolean(),
	overrideDetails: z.boolean(),
})
const provider = z.object({ text: z.string(), value: z.string() })
export function SelectionTools({
	library,
	ids,
	podcast,
	pending,
	run,
}: {
	library: string
	ids: string[]
	podcast: boolean
	pending: boolean
	run: (work: () => Promise<unknown>) => Promise<void>
}) {
	const user = useAuth((state) => state.user)
	const actor = z
		.object({
			type: z.string().optional(),
			permissions: z
				.object({
					delete: z.boolean().optional(),
					download: z.boolean().optional(),
				})
				.optional(),
		})
		.safeParse(user)
	const admin =
		actor.success && ['root', 'admin'].includes(actor.data.type || '')
	const [providers, setProviders] = useState<z.infer<typeof provider>[]>([])
	const [providerId, setProviderId] = useState('')
	const [showMatch, setShowMatch] = useState(false)
	const [hard, setHard] = useState(false)
	const [error, setError] = useState('')
	useEffect(() => {
		if (!showMatch || !admin) return
		let active = true
		void api(
			'/api/search/providers',
			z.object({
				providers: z.object({
					books: z.array(provider),
					podcasts: z.array(provider),
				}),
			}),
		)
			.then((data) => {
				if (active) {
					const choices = podcast
						? data.providers.podcasts
						: data.providers.books
					setProviders(choices)
					setProviderId(choices[0]?.value || '')
				}
			})
			.catch((cause: unknown) => {
				if (active)
					setError(
						cause instanceof Error ? cause.message : 'Providers unavailable',
					)
			})
		return () => {
			active = false
		}
	}, [showMatch, admin, podcast])
	return (
		<div className="flex flex-wrap items-center gap-3">
			{admin && (
				<Button
					disabled={pending}
					variant="outline"
					onClick={() => setShowMatch(!showMatch)}
				>
					Quick match options
				</Button>
			)}
			{actor.success &&
				actor.data.permissions?.download &&
				ids.length <= 40 && (
					<Button
						disabled={pending}
						variant="outline"
						onClick={() => {
							void run(async () => {
								const bytes = await apiBinary(
									`/api/libraries/${encodeURIComponent(library)}/download?${new URLSearchParams({ ids: ids.join(',') })}`,
								)
								const url = URL.createObjectURL(
									new Blob([bytes], { type: 'application/zip' }),
								)
								const link = document.createElement('a')
								link.href = url
								link.download = 'selected-items.zip'
								link.click()
								setTimeout(() => URL.revokeObjectURL(url), 60_000)
							})
						}}
					>
						Download selected ZIP
					</Button>
				)}
			{actor.success && actor.data.permissions?.delete && (
				<>
					<label>
						<input
							type="checkbox"
							checked={hard}
							onChange={(event) => setHard(event.target.checked)}
						/>
						Delete media from filesystem
					</label>
					<Button
						disabled={pending}
						variant="destructive"
						onClick={() => {
							if (
								window.confirm(
									hard
										? `Permanently delete ${ids.length} selected items and their media files from the filesystem? This cannot be undone.`
										: `Remove ${ids.length} selected items from library? Media files remain unchanged.`,
								)
							)
								void run(() =>
									api(
										`/api/items/batch/delete?hard=${hard ? '1' : '0'}`,
										z.unknown(),
										{
											method: 'POST',
											body: JSON.stringify({ libraryItemIds: ids }),
										},
									),
								)
						}}
					>
						{hard ? 'Delete items and files' : 'Remove selected items'}
					</Button>
				</>
			)}
			{showMatch && (
				<form
					className="w-full space-y-3 rounded border bg-card p-4"
					onSubmit={(event) => {
						event.preventDefault()
						const data = new FormData(event.currentTarget)
						const options = quickMatchOptions.parse({
							provider: providerId,
							overrideCover: data.has('overrideCover'),
							overrideDetails: data.has('overrideDetails'),
						})
						void run(() =>
							api('/api/items/batch/quickmatch', z.unknown(), {
								method: 'POST',
								body: JSON.stringify({ libraryItemIds: ids, options }),
							}),
						).then(() => setShowMatch(false))
					}}
				>
					<h2 className="text-lg">Match selected items</h2>
					<label>
						Provider
						<select
							required
							value={providerId}
							onChange={(event) => setProviderId(event.target.value)}
							className="ml-3 rounded border bg-background p-2"
						>
							{providers.map((value) => (
								<option key={value.value} value={value.value}>
									{value.text}
								</option>
							))}
						</select>
					</label>
					<label className="block">
						<input type="checkbox" name="overrideCover" defaultChecked />
						Update cover
					</label>
					<label className="block">
						<input type="checkbox" name="overrideDetails" defaultChecked />
						Update details
					</label>
					{error && <p role="alert">{error}</p>}
					<Button type="submit" disabled={pending || !providerId}>
						Start quick match
					</Button>
					<Button
						type="button"
						variant="outline"
						onClick={() => setShowMatch(false)}
					>
						Cancel
					</Button>
				</form>
			)}
		</div>
	)
}
