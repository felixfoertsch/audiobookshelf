#!/bin/sh
# ponytail: POSIX sh required by nginx-unprivileged Alpine, which does not ship Bash.
set -eu

upstream_host() {
	case "$1" in
		https://*) authority=${1#https://} ;;
		http://*) authority=${1#http://} ;;
		*) echo 'upstream URL must use http or https' >&2; return 1 ;;
	esac
	authority=${authority%/}
	case "$authority" in
		''|*@*|*'?'*|*'#'*|*/*) echo 'upstream URL must be an origin URL without credentials or path' >&2; return 1 ;;
	esac
	case "$authority" in
		*:*)
			host=${authority%%:*}
			port=${authority#*:}
			case "$port" in ''|*[!0-9]*) echo 'invalid upstream port' >&2; return 1 ;; esac
			[ "${#port}" -le 5 ] && [ "$port" -ge 1 ] && [ "$port" -le 65535 ] || {
				echo 'upstream port must be between 1 and 65535' >&2
				return 1
			}
			;;
		*) host=$authority ;;
	esac
	case "$host" in
		''|*[!A-Za-z0-9.-]*) echo 'upstream URL must use a DNS hostname' >&2; return 1 ;;
	esac
	newline='
'
	case "$host" in
		*"$newline"*) echo 'upstream URL must use a DNS hostname' >&2; return 1 ;;
	esac
	printf '%s' "$host"
}

if [ "${1:-}" = --self-check ]; then
	[ "$(upstream_host 'https://abs.example:443/')" = abs.example ]
	[ "$(upstream_host 'http://sidecar:3000/')" = sidecar ]
	for invalid in 'ftp://abs.example' 'http://abs.example:0' 'http://abs.example:65536' 'http://bad_host' 'http://abs.example/path'; do
		if upstream_host "$invalid" >/dev/null 2>&1; then
			echo "accepted invalid upstream: $invalid" >&2
			exit 1
		fi
	done
	newline=$(printf '\nX')
	newline=${newline%X}
	if upstream_host "http://bad${newline}host" >/dev/null 2>&1; then
		echo 'accepted newline in upstream hostname' >&2
		exit 1
	fi
	printf '%s\n' 'upstream URL self-check passed'
	exit 0
fi

case "${EXTERNAL_SCHEME:-https}" in
	http|https) EXTERNAL_SCHEME=${EXTERNAL_SCHEME:-https} ;;
	*) echo 'EXTERNAL_SCHEME must be http or https' >&2; exit 1 ;;
esac
ABS_UPSTREAM=${ABS_UPSTREAM:-https://audiobookshelf.felixfoertsch.de}
PSB_UPSTREAM=${PSB_UPSTREAM:-http://podcast-sponsorblock:3000}
ABS_UPSTREAM=${ABS_UPSTREAM%/}
PSB_UPSTREAM=${PSB_UPSTREAM%/}
ABS_UPSTREAM_HOST=$(upstream_host "$ABS_UPSTREAM")
PSB_UPSTREAM_HOST=$(upstream_host "$PSB_UPSTREAM")
export ABS_UPSTREAM PSB_UPSTREAM ABS_UPSTREAM_HOST PSB_UPSTREAM_HOST EXTERNAL_SCHEME
exec /docker-entrypoint.sh "$@"
