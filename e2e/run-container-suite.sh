#!/usr/bin/env bash
set -euo pipefail

suffix=$$
network=modern-ui-e2e-$suffix
frontend=modern-ui-e2e-frontend-$suffix
abs=modern-ui-e2e-abs-$suffix
psb=modern-ui-e2e-psb-$suffix
cleanup() {
	docker rm -f "$frontend" "$abs" "$psb" >/dev/null 2>&1 || true
	docker network rm "$network" >/dev/null 2>&1 || true
}
cleanup
trap cleanup EXIT

docker network create "$network" >/dev/null
docker run -d --rm --name "$abs" --network "$network" --network-alias abs-mock modern-ui-e2e:abs >/dev/null
docker run -d --rm --name "$psb" --network "$network" --network-alias sidecar-mock modern-ui-e2e:psb >/dev/null
docker run -d --rm --name "$frontend" --network "$network" --network-alias modern-ui-e2e-frontend -p 127.0.0.1:4180:8080 \
	-e ABS_UPSTREAM=http://abs-mock:4179 -e PSB_UPSTREAM=http://sidecar-mock:4181 \
	modern-ui-e2e:frontend >/dev/null
for attempt in {1..30}; do
	if curl --fail --silent http://127.0.0.1:4180/health >/dev/null; then break; fi
	sleep 1
done
curl --fail --silent http://127.0.0.1:4180/health >/dev/null
docker run --rm --network "container:$frontend" -e BUILT_BASE_URL=http://127.0.0.1:8080 \
	modern-ui-e2e:runner
