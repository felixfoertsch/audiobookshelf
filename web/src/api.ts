import { type ZodType, z } from 'zod'
import { create } from 'zustand'
import { safeReturnPath } from './features/auth/navigation'
import { setServerLanguage } from './features/i18n'

declare global {
	interface Window {
		__ABS_WEB_CONFIG__?: { basePath?: string; apiBasePath?: string }
	}
}
const config = () => window.__ABS_WEB_CONFIG__ ?? {}
const base = () => (config().apiBasePath ?? '').replace(/\/$/, '')

export const userSchema = z
	.object({
		id: z.string().min(1),
		username: z.string(),
		accessToken: z.string().min(1),
	})
	.passthrough()
const bootstrapSchema = z.object({
	serverSettings: z.object({}).passthrough().optional(),
	Source: z.string().nullish(),
	ereaderDevices: z
		.array(z.object({ name: z.string(), email: z.string() }).passthrough())
		.optional(),
})
const loginSchema = z
	.object({
		user: userSchema,
		userDefaultLibraryId: z.string().nullish(),
		...bootstrapSchema.shape,
	})
	.passthrough()
export const statusSchema = z
	.object({
		isInit: z.boolean(),
		authMethods: z.array(z.string()).optional(),
		ConfigPath: z.string().optional(),
		MetadataPath: z.string().optional(),
		authFormData: z
			.object({
				authOpenIDButtonText: z.string().nullish(),
				authLoginCustomMessage: z.string().nullish(),
				authOpenIDAutoLaunch: z.boolean().optional(),
			})
			.passthrough()
			.optional(),
	})
	.passthrough()
export type AuthUser = z.infer<typeof userSchema>
type AuthState = {
	user: AuthUser | null
	loading: boolean
	initialized: boolean
	authMethods: string[]
	serverStatus: z.infer<typeof statusSchema> | null
	startupError: string
	bootstrap: z.infer<typeof bootstrapSchema> | null
	defaultLibraryId: string | null | undefined
	set: (user: AuthUser | null) => void
	initialize: () => void
}

const tokenKey = 'token'
const token = () => localStorage.getItem(tokenKey)
const setToken = (user: z.infer<typeof userSchema>) => {
	if (typeof user.accessToken === 'string')
		localStorage.setItem(tokenKey, user.accessToken)
	else localStorage.removeItem(tokenKey)
}
let socket: { emit: (event: string, token: string) => unknown } | null = null
export function setAuthSocket(
	value: { emit: (event: string, token: string) => unknown } | null,
) {
	socket = value
}
const updateToken = (user: z.infer<typeof userSchema>) => {
	setToken(user)
	if (typeof user.accessToken === 'string')
		socket?.emit('auth', user.accessToken)
}
let refreshPromise: Promise<string | null> | null = null
let authGeneration = 0
export function getAuthGeneration() {
	return authGeneration
}

export class ApiError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message)
		this.name = 'ApiError'
	}
}

async function refresh(): Promise<string | null> {
	if (!refreshPromise)
		refreshPromise = (async () => {
			const generation = authGeneration
			try {
				const response = await fetch(`${base()}/auth/refresh`, {
					method: 'POST',
					credentials: 'include',
					headers: token() ? { authorization: `Bearer ${token()}` } : {},
				})
				if (!response.ok)
					throw new ApiError('Session expired. Sign in again.', response.status)
				const payload = loginSchema.parse(await response.json())
				if (generation !== authGeneration) return null
				const previousUser = useAuth.getState().user
				if (previousUser && previousUser.id !== payload.user.id)
					authGeneration++
				updateToken(payload.user)
				useAuth.setState({
					user: payload.user,
					defaultLibraryId: payload.userDefaultLibraryId,
					bootstrap: bootstrapSchema.parse(payload),
					initialized: true,
					loading: false,
				})
				return token()
			} catch (error) {
				if (
					generation === authGeneration &&
					error instanceof ApiError &&
					error.status === 401
				) {
					if (useAuth.getState().user) authGeneration++
					localStorage.removeItem(tokenKey)
					useAuth.setState({
						user: null,
						initialized: true,
						loading: false,
						defaultLibraryId: undefined,
						bootstrap: null,
					})
				}
				if (error instanceof z.ZodError || error instanceof SyntaxError)
					throw new Error(
						'Server returned an invalid session. Retry signing in.',
						{ cause: error },
					)
				throw error
			} finally {
				refreshPromise = null
			}
		})()
	return refreshPromise
}

async function request(
	path: string,
	init: RequestInit = {},
): Promise<Response> {
	if (
		/^[a-z][a-z\d+.-]*:/i.test(path) ||
		path.startsWith('//') ||
		path.includes('\\')
	)
		throw new Error('API path must be same-origin')
	const pathname = path.split('?')[0]
	const normalizedPath =
		['/login', '/logout', '/status', '/init', '/auth/refresh'].includes(
			pathname,
		) ||
		path.startsWith('/api/') ||
		path.startsWith('/auth/') ||
		path.startsWith('/public/')
			? path
			: `/api${path.startsWith('/') ? path : `/${path}`}`
	const send = () =>
		fetch(`${base()}${normalizedPath}`, {
			...init,
			credentials: 'include',
			headers: {
				...(init.body && !(init.body instanceof FormData)
					? { 'content-type': 'application/json' }
					: {}),
				...(token() ? { authorization: `Bearer ${token()}` } : {}),
				...init.headers,
			},
		})
	const generation = authGeneration
	let response = await send()
	if (
		response.status === 401 &&
		generation === authGeneration &&
		!['/auth/refresh', '/login', '/status', '/init'].includes(pathname)
	) {
		await refresh()
		if (generation !== authGeneration)
			throw new ApiError('Session changed. Retry signing in.', 401)
		response = await send()
	}
	if (!response.ok) {
		let message = `Request failed (${response.status})`
		try {
			const text = await response.text()
			let body: unknown
			try {
				body = JSON.parse(text)
			} catch {
				body = text
			}
			if (typeof body === 'string' && body.length > 0 && body.length < 1000)
				message = body
			if (
				typeof body === 'object' &&
				body &&
				'error' in body &&
				typeof body.error === 'string'
			)
				message = body.error
		} catch {
			/* body may be empty */
		}
		if (response.status === 403)
			message =
				'Permission denied. Your account may not have access to this action.'
		throw new ApiError(message, response.status)
	}
	if (generation !== authGeneration)
		throw new ApiError('Session changed. Retry signing in.', 401)
	return response
}

export async function apiBinary(
	path: string,
	init: RequestInit = {},
): Promise<ArrayBuffer> {
	const generation = authGeneration
	const result = await (await request(path, init)).arrayBuffer()
	if (generation !== authGeneration)
		throw new ApiError('Session changed. Retry signing in.', 401)
	return result
}

export async function api<T>(
	path: string,
	schema: ZodType<T>,
	init: RequestInit = {},
): Promise<T> {
	const generation = authGeneration
	const body = await (await request(path, init)).text()
	if (generation !== authGeneration)
		throw new ApiError('Session changed. Retry signing in.', 401)
	try {
		if (!body || body === 'OK') return schema.parse({})
		return schema.parse(JSON.parse(body))
	} catch (cause) {
		throw new Error('Server returned an invalid response. Retry.', { cause })
	}
}

export const useAuth = create<AuthState>((set) => ({
	user: null,
	loading: true,
	initialized: false,
	authMethods: [],
	serverStatus: null,
	startupError: '',
	bootstrap: null,
	defaultLibraryId: undefined,
	set: (user) =>
		set({
			user,
			initialized: true,
			loading: false,
			...(user ? {} : { defaultLibraryId: undefined, bootstrap: null }),
		}),
	initialize: () => set({ initialized: true, loading: false }),
}))
let beforeLogout: (() => Promise<void>) | undefined
export function setBeforeLogout(callback: (() => Promise<void>) | undefined) {
	beforeLogout = callback
}
export function logoutRedirect(value: string) {
	const url = new URL(value, window.location.origin)
	if (!['http:', 'https:'].includes(url.protocol))
		throw new Error('Invalid logout redirect URL')
	return url.href
}
export async function initializeAuth() {
	useAuth.setState({ startupError: '' })
	const url = new URL(window.location.href)
	const callbackToken =
		url.searchParams.get('accessToken') || url.searchParams.get('setToken')
	if (callbackToken) localStorage.setItem(tokenKey, callbackToken)
	for (const key of ['accessToken', 'setToken', 'code', 'state'])
		url.searchParams.delete(key)
	window.history.replaceState(null, '', url)
	try {
		const response = await api('/status', statusSchema)
		await setServerLanguage(response.language)
		useAuth.setState({
			authMethods: response.authMethods?.length
				? response.authMethods
				: ['local'],
			serverStatus: response,
		})
		if (!response.isInit) {
			useAuth.getState().set(null)
			return response
		}
		try {
			await refresh()
		} catch (error) {
			if (!(error instanceof ApiError && error.status === 401)) throw error
		}
		return response
	} catch (error) {
		useAuth.setState({
			startupError:
				error instanceof Error ? error.message : 'Server unavailable',
		})
		useAuth.getState().initialize()
		throw error
	}
}
export async function login(username: string, password: string) {
	const result = await api('/login', loginSchema, {
		method: 'POST',
		body: JSON.stringify({ username, password }),
	})
	authGeneration++
	updateToken(result.user)
	useAuth.setState({
		user: result.user,
		initialized: true,
		loading: false,
		defaultLibraryId: result.userDefaultLibraryId,
		bootstrap: bootstrapSchema.parse(result),
	})
	return result.user
}
export async function logout(allDevices = false) {
	window.dispatchEvent(new Event('abs:logout-start'))
	await beforeLogout?.()
	const result = await api(
		allDevices ? '/logout?allDevices=1' : '/logout',
		z.object({ redirect_url: z.string().nullish() }),
		{ method: 'POST' },
	)
	const redirect = result.redirect_url
		? logoutRedirect(result.redirect_url)
		: undefined
	authGeneration++
	localStorage.removeItem(tokenKey)
	useAuth.getState().set(null)
	if (redirect) window.location.assign(redirect)
}
export function startOidcLogin() {
	const intended = new URLSearchParams(window.location.search).get('redirect')
	if (intended && intended.length <= 2048)
		sessionStorage.setItem('abs:login:return', safeReturnPath(intended))
	window.location.assign(
		`${base()}/auth/openid?callback=${encodeURIComponent(window.location.href.split('?')[0])}`,
	)
}
export function authHeaders(): HeadersInit {
	return token() ? { authorization: `Bearer ${token()}` } : {}
}
