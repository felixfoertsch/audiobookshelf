import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import { api, useAuth } from '../../api'
import { Button } from '../../shared/components/ui/button'
import { Label } from '../../shared/components/ui/label'
import { NativeSelect } from '../../shared/components/ui/native-select'
import { dateTime } from '../../shared/date-time'

const sessionSchema = z.object({
	id: z.string(),
	updatedAt: z.number(),
	timeListening: z.number(),
	displayTitle: z.string().nullable().optional(),
	mediaMetadata: z.record(z.string(), z.unknown()).nullable().optional(),
})
const statsSchema = z.object({
	totalTime: z.number(),
	days: z.record(z.string(), z.number()),
	recentSessions: z.array(sessionSchema),
})
const personalYearSchema = z
	.object({
		totalListeningTime: z.number(),
		totalBookListeningTime: z.number(),
		totalPodcastListeningTime: z.number(),
		numBooksFinished: z.number(),
		numBooksListened: z.number(),
		topAuthors: z.array(z.object({ name: z.string(), time: z.number() })),
		topGenres: z.array(z.object({ genre: z.string(), time: z.number() })),
		mostListenedMonth: z
			.object({ month: z.number(), time: z.number() })
			.nullable(),
	})
	.passthrough()
const adminYearSchema = z
	.object({
		numListeningSessions: z.number(),
		numBooksAdded: z.number(),
		numAuthorsAdded: z.number(),
		totalListeningTime: z.number(),
		numBooks: z.number(),
		topAuthors: z.array(z.object({ name: z.string(), time: z.number() })),
		topGenres: z.array(z.object({ genre: z.string(), time: z.number() })),
	})
	.passthrough()
function number(value: number) {
	return new Intl.NumberFormat().format(value)
}
function elapsed(seconds: number) {
	const hours = Math.floor(seconds / 3600)
	const minutes = Math.floor((seconds % 3600) / 60)
	return hours ? `${hours}h ${minutes}m` : `${minutes}m`
}
function dateKey(date: Date) {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
function dayIntensity(seconds: number) {
	return seconds ? Math.min(4, Math.ceil(seconds / 3600)) : 0
}
export function Stats() {
	const user = useAuth((state) => state.user)
	const [stats, setStats] = useState<z.infer<typeof statsSchema> | null>(null)
	const [error, setError] = useState('')
	const [showYear, setShowYear] = useState(false)

	const [yearData, setYearData] = useState<z.infer<
		typeof personalYearSchema
	> | null>(null)
	const [adminYearData, setAdminYearData] = useState<z.infer<
		typeof adminYearSchema
	> | null>(null)
	const [personalQuery, setPersonalQuery] = useState({
		year: new Date().getFullYear(),
		revision: 0,
	})
	const [serverQuery, setServerQuery] = useState({
		year: new Date().getFullYear(),
		revision: 0,
	})
	const isAdmin = user?.type === 'root' || user?.type === 'admin'
	const [yearStatus, setYearStatus] = useState('')
	useEffect(() => {
		let live = true
		const load = () => api('/me/listening-stats', statsSchema)
		void load()
			.then((data) => {
				if (live) setStats(data)
			})
			.catch((e: unknown) => {
				if (live)
					setError(
						e instanceof Error ? e.message : 'Could not load listening stats',
					)
			})
		const onSocket = (event: Event) => {
			const detail = (event as CustomEvent<{ event?: string }>).detail
			if (
				detail?.event === 'reconnect' ||
				detail?.event === 'user_item_progress_updated'
			)
				void load()
					.then((data) => {
						if (live) setStats(data)
					})
					.catch((e: unknown) => {
						if (live)
							setError(
								e instanceof Error
									? e.message
									: 'Could not reload listening stats',
							)
					})
		}
		window.addEventListener('abs:socket', onSocket)
		return () => {
			live = false
			window.removeEventListener('abs:socket', onSocket)
		}
	}, [])
	useEffect(() => {
		if (!showYear) return
		let live = true
		setYearData(null)
		setYearStatus('Loading year review…')
		const load = () =>
			api(`/me/stats/year/${personalQuery.year}`, personalYearSchema)
		void load()
			.then((data) => {
				if (live) {
					setYearData(data)
					setYearStatus('')
				}
			})
			.catch((e: unknown) => {
				if (live)
					setYearStatus(
						e instanceof Error ? e.message : 'Could not load year review',
					)
			})
		return () => {
			live = false
		}
	}, [showYear, personalQuery])
	useEffect(() => {
		if (!showYear || !isAdmin) return
		let live = true
		setAdminYearData(null)
		void api(`/stats/year/${serverQuery.year}`, adminYearSchema)
			.then((data) => {
				if (live) setAdminYearData(data)
			})
			.catch((e: unknown) => {
				if (live)
					setYearStatus(
						e instanceof Error
							? e.message
							: 'Could not load server year review',
					)
			})
		return () => {
			live = false
		}
	}, [showYear, serverQuery, isAdmin])
	const progressList: { isFinished?: boolean }[] = Array.isArray(
		user?.mediaProgress,
	)
		? user.mediaProgress
		: []
	const finished = progressList.filter((progress) => progress.isFinished).length
	const today = new Date()
	const last7 = Array.from({ length: 7 }, (_, index) => {
		const date = new Date(
			today.getFullYear(),
			today.getMonth(),
			today.getDate() - 6 + index,
		)
		const key = dateKey(date)
		return {
			key,
			seconds: stats?.days[key] ?? 0,
			label: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()],
		}
	})
	const maximum = Math.max(60, ...last7.map((day) => day.seconds))
	let streak = 0
	for (
		let offset = 0;
		stats?.days[
			dateKey(
				new Date(
					today.getFullYear(),
					today.getMonth(),
					today.getDate() - offset,
				),
			)
		];
		offset++
	)
		streak++
	const allDays = stats
		? Object.entries(stats.days).sort(([a], [b]) => a.localeCompare(b))
		: []
	const yearListened = allDays.filter(
		([day, value]) => day.startsWith(`${personalQuery.year}-`) && value > 0,
	).length
	return (
		<section className="space-y-6">
			<h1 className="text-2xl">Your stats</h1>
			{error && <p role="alert">{error}</p>}
			{!stats && !error && <p role="status">Loading listening stats…</p>}
			<div className="grid grid-cols-3 gap-3 text-center">
				<div>
					<p className="text-3xl font-bold">{number(finished)}</p>
					<p>Items finished</p>
				</div>
				<div>
					<p className="text-3xl font-bold">
						{number(stats ? Object.keys(stats.days).length : 0)}
					</p>
					<p>Days listened</p>
				</div>
				<div>
					<p className="text-3xl font-bold">
						{number(Math.round((stats?.totalTime ?? 0) / 60))}
					</p>
					<p>Minutes listening</p>
				</div>
			</div>
			{stats && (
				<>
					<div className="flex flex-col gap-6 md:flex-row">
						<section className="flex-1 space-y-3">
							<h2 className="text-xl">Minutes listening, last 7 days</h2>
							<div
								role="img"
								className="flex h-48 items-end gap-3 border-b border-l p-3"
								aria-label="Daily listening chart"
							>
								{last7.map((day) => (
									<div
										key={day.key}
										className="flex h-full flex-1 flex-col justify-end text-center"
									>
										<span className="text-xs">
											{number(Math.round(day.seconds / 60))}
										</span>
										<div
											title={`${day.key}: ${elapsed(day.seconds)}`}
											className="mx-auto w-4/5 bg-primary"
											style={{
												height: `${Math.max(1, (day.seconds / maximum) * 75)}%`,
											}}
										/>
										<span className="text-xs">{day.label}</span>
									</div>
								))}
							</div>
							<div className="grid grid-cols-2 gap-2 text-center">
								<p>
									This week
									<br />
									<strong>
										{number(
											Math.round(
												last7.reduce((sum, day) => sum + day.seconds, 0) / 60,
											),
										)}{' '}
										min
									</strong>
								</p>
								<p>
									Daily average
									<br />
									<strong>
										{number(
											Math.round(
												last7.reduce((sum, day) => sum + day.seconds, 0) / 420,
											),
										)}{' '}
										min
									</strong>
								</p>
								<p>
									Best day
									<br />
									<strong>{number(Math.round(maximum / 60))} min</strong>
								</p>
								<p>
									Days in a row
									<br />
									<strong>{number(streak)}</strong>
								</p>
							</div>
						</section>
						<section className="w-full space-y-3 md:w-80">
							<h2 className="text-xl">Recent sessions</h2>
							{(user?.type === 'root' || user?.type === 'admin') && (
								<Link
									to="/config/users/$id/sessions"
									params={{ id: user?.id ?? '' }}
									className="text-primary underline"
								>
									View all sessions
								</Link>
							)}
							{stats.recentSessions.length ? (
								<ol className="space-y-2">
									{stats.recentSessions.map((session) => (
										<li key={session.id} className="flex justify-between gap-3">
											<span>
												{session.displayTitle ??
													(typeof session.mediaMetadata?.title === 'string'
														? session.mediaMetadata.title
														: '')}{' '}
												· {dateTime(session.updatedAt)}
											</span>
											<strong>{elapsed(session.timeListening)}</strong>
										</li>
									))}
								</ol>
							) : (
								<p>No listening sessions</p>
							)}
						</section>
					</div>
					<section className="space-y-3">
						<h2 className="text-xl">Listening activity in the last year</h2>
						<p>
							{number(
								allDays.filter(
									([, value]) =>
										value > 0 &&
										Date.now() -
											Date.parse(
												`${allDays[0]?.[0] ?? dateKey(today)}T00:00:00`,
											) <
											366 * 86400000,
								).length,
							)}{' '}
							days with listening activity
						</p>
						<div
							role="img"
							className="grid grid-cols-[repeat(13,minmax(0,1fr))] gap-1 sm:grid-cols-[repeat(26,minmax(0,1fr))] md:grid-cols-[repeat(52,minmax(0,1fr))]"
							aria-label="Listening activity heatmap"
						>
							{Array.from({ length: 364 }, (_, index) => {
								const date = new Date(
									today.getFullYear(),
									today.getMonth(),
									today.getDate() - 363 + index,
								)
								const key = dateKey(date)
								const value = stats.days[key] ?? 0
								return (
									<span
										key={key}
										title={`${key}: ${elapsed(value)}`}
										className={`aspect-square rounded-sm ${['bg-muted', 'bg-primary/20', 'bg-primary/40', 'bg-primary/60', 'bg-primary'][dayIntensity(value)]}`}
									/>
								)
							})}
						</div>
						<p className="text-sm text-muted-foreground">
							Less · ▪ ▪ ▪ ▪ · More
						</p>
					</section>
				</>
			)}
			<section className="space-y-3">
				<h2 className="text-xl">Year in review</h2>
				<Button
					variant="outline"
					onClick={() => setShowYear((shown) => !shown)}
				>
					{showYear ? 'Hide' : 'Show'} year in review
				</Button>
				{showYear && (
					<>
						<Label>
							Year{' '}
							<NativeSelect
								value={personalQuery.year}
								onChange={(event) => {
									const selectedYear = Number(event.target.value)
									setPersonalQuery((query) => ({
										...query,
										year: selectedYear,
									}))
									setServerQuery((query) => ({ ...query, year: selectedYear }))
								}}
							>
								{Array.from(
									{
										length: Math.max(
											1,
											new Date().getFullYear() -
												new Date(
													typeof user?.createdAt === 'number' ||
														typeof user?.createdAt === 'string'
														? user.createdAt
														: Date.now(),
												).getFullYear() +
												1,
										),
									},
									(_, index) => new Date().getFullYear() - index,
								).map((value) => (
									<option key={value}>{value}</option>
								))}
							</NativeSelect>
						</Label>
						{yearStatus && <p role="status">{yearStatus}</p>}
						{yearData && (
							<div className="rounded border p-4">
								<h3 className="text-lg">
									{personalQuery.year} listening summary
								</h3>
								<p>{number(yearListened)} days listened</p>
								<div className="flex gap-2">
									<Button
										variant="outline"
										onClick={() =>
											setPersonalQuery((query) => ({
												...query,
												revision: query.revision + 1,
											}))
										}
									>
										Refresh personal review
									</Button>
								</div>
								<p>
									{elapsed(yearData.totalListeningTime)} listening ·{' '}
									{elapsed(yearData.totalBookListeningTime)} books ·{' '}
									{elapsed(yearData.totalPodcastListeningTime)} podcasts
								</p>
								<p>
									{number(yearData.numBooksFinished)} books finished ·{' '}
									{number(yearData.numBooksListened)} books listened
								</p>
								{yearData.mostListenedMonth && (
									<p>
										Most-listened month: {yearData.mostListenedMonth.month + 1}{' '}
										· {elapsed(yearData.mostListenedMonth.time)}
									</p>
								)}
								<h4>Top authors</h4>
								<ol>
									{yearData.topAuthors.map((item) => (
										<li key={item.name}>
											{item.name}: {elapsed(item.time)}
										</li>
									))}
								</ol>
								<h4>Top genres</h4>
								<ol>
									{yearData.topGenres.map((item) => (
										<li key={item.genre}>
											{item.genre}: {elapsed(item.time)}
										</li>
									))}
								</ol>
								{isAdmin && (
									<section>
										<div className="flex gap-2">
											<Button
												variant="outline"
												onClick={() =>
													setServerQuery((query) => ({
														...query,
														revision: query.revision + 1,
													}))
												}
											>
												Refresh server review
											</Button>
										</div>
										{adminYearData ? (
											<>
												<p>
													{number(adminYearData.numListeningSessions)} sessions
													· {number(adminYearData.numBooksAdded)} books added ·{' '}
													{number(adminYearData.numAuthorsAdded)} authors added
												</p>
												<p>
													{number(adminYearData.numBooks)} total books ·{' '}
													{elapsed(adminYearData.totalListeningTime)} listening
												</p>
											</>
										) : (
											<p role="status">Loading server year review…</p>
										)}
									</section>
								)}
								<Button
									variant="outline"
									onClick={() => {
										if (navigator.share)
											void navigator
												.share({
													title: `${personalQuery.year} listening review`,
													text: `${personalQuery.year}: ${number(yearData.numBooksFinished)} books finished; ${elapsed(yearData.totalListeningTime)} listening`,
												})
												.catch(() => undefined)
										else setYearStatus('Sharing unavailable in this browser')
									}}
								>
									Share year summary
								</Button>
							</div>
						)}
					</>
				)}
			</section>
		</section>
	)
}
