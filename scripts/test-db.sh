#!/usr/bin/env bash
# devloop — local database test. Proves that the migrations apply from scratch and re-apply
# cleanly, that the seed loads twice, and runs scripts/rls-test.sql (PASS/FAIL per check).
#
#   scripts/test-db.sh            start (or reuse) a throw-away Supabase Postgres in Docker
#   PGURL=postgres://… scripts/test-db.sh --no-docker     use an existing local database
#
# The Docker path uses the official supabase/postgres image (real roles, default privileges,
# auth schema) and, when the supabase/gotrue image is available, the real auth migrations.
# Otherwise supabase/tests/auth-shim.sql adds the few auth columns the tests need.
# NEVER point this at a real project: step 1 wipes the `public` schema.
set -euo pipefail
cd "$(dirname "$0")/.."

PG_IMAGE="${PG_IMAGE:-supabase/postgres:17.6.1.064}"
AUTH_IMAGE="${AUTH_IMAGE:-supabase/gotrue:v2.180.0}"
PORT="${PGPORT_LOCAL:-54329}"
export PGPASSWORD="${PGPASSWORD:-postgres}"
ADMIN="${PGURL_ADMIN:-postgresql://supabase_admin@127.0.0.1:$PORT/postgres}"
PGURL="${PGURL:-postgresql://postgres@127.0.0.1:$PORT/postgres}"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
q() { psql "$PGURL" -v ON_ERROR_STOP=1 -X -q "$@"; }
step() { printf '\n== %s\n' "$*"; }

if [[ "${1:-}" != "--no-docker" ]]; then
  step "database container"
  if ! docker ps --format '{{.Names}}' | grep -qx devloop-pg; then
    docker rm -f devloop-pg >/dev/null 2>&1 || true
    docker run -d --name devloop-pg -e POSTGRES_PASSWORD="$PGPASSWORD" -p "$PORT:5432" "$PG_IMAGE" >/dev/null
  fi
  for _ in $(seq 1 60); do psql "$PGURL" -X -qAtc 'select 1' >/dev/null 2>&1 && break; sleep 1; done
  if [[ "$(psql "$PGURL" -X -qAtc "select to_regclass('auth.identities') is not null")" != "t" ]]; then
    if docker image inspect "$AUTH_IMAGE" >/dev/null 2>&1 || docker pull -q "$AUTH_IMAGE" >/dev/null 2>&1; then
      echo "running the real auth migrations ($AUTH_IMAGE)"
      psql "$ADMIN" -X -qc "alter role supabase_auth_admin with password '$PGPASSWORD'"
      docker rm -f devloop-auth >/dev/null 2>&1 || true
      docker run -d --name devloop-auth --network host -e GOTRUE_API_HOST=127.0.0.1 -e GOTRUE_API_PORT=54399 \
        -e API_EXTERNAL_URL=http://127.0.0.1:54399 -e GOTRUE_DB_DRIVER=postgres \
        -e "GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:$PGPASSWORD@127.0.0.1:$PORT/postgres" \
        -e GOTRUE_SITE_URL=http://localhost:5173 -e GOTRUE_JWT_SECRET=local-test-jwt-secret-with-at-least-32-characters \
        -e GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED=true -e GOTRUE_MAILER_AUTOCONFIRM=true "$AUTH_IMAGE" >/dev/null
      for _ in $(seq 1 30); do
        [[ "$(psql "$PGURL" -X -qAtc "select to_regclass('auth.identities') is not null")" == "t" ]] && break; sleep 1
      done
    fi
  fi
fi
if [[ "$(psql "$PGURL" -X -qAtc "select to_regclass('auth.identities') is not null")" != "t" ]]; then
  echo "applying supabase/tests/auth-shim.sql"
  psql "$ADMIN" -X -q -v ON_ERROR_STOP=1 -f supabase/tests/auth-shim.sql
fi
psql "$PGURL" -X -qAtc "select 'postgres ' || current_setting('server_version') || ', pgvector ' || (select default_version from pg_available_extensions where name = 'vector')"

step "1. reset (local only)"
psql "$ADMIN" -X -q -v ON_ERROR_STOP=1 -f supabase/tests/reset-local.sql 2>&1 | grep -v -e NOTICE -e DETAIL -e 'drop cascades' -e HINT || true

step "2. migrations from scratch"
for f in supabase/migrations/*.sql; do q -f "$f" 2>&1 | grep -v NOTICE || true; echo "applied $f"; done
step "3. migrations again (must be re-runnable)"
for f in supabase/migrations/*.sql; do q -f "$f" 2>&1 | grep -v NOTICE || true; done; echo "re-applied cleanly"

step "4. seed (twice)"
SEED_IN="seed/seed.json"; [[ -f "$SEED_IN" ]] || SEED_IN="supabase/tests/fixture-seed.json"
node scripts/seed.mjs --in "$SEED_IN" --out "$TMP/seed.sql"
q -f "$TMP/seed.sql"; q -f "$TMP/seed.sql"
q -At -c "select 'profiles ' || (select count(*) from public.profiles) || ', posts ' || (select count(*) from public.posts)
  || ', answers ' || (select count(*) from public.answers) || ', messages ' || (select count(*) from public.messages)
  || ', counters consistent: ' || (select bool_and(p.answer_count = (select count(*) from public.answers a where a.post_id = p.id)
       and (p.status = 'solved') = (p.accepted_answer_id is not null) and p.fts is not null) from public.posts p)"

step "5. security + behaviour checks (scripts/rls-test.sql)"
q -At -F ' | ' -f scripts/rls-test.sql | tee "$TMP/out.txt"
if grep -q '^FAIL' "$TMP/out.txt" || ! grep -q '^SUMMARY.*ALL PASS' "$TMP/out.txt"; then
  printf '\nRESULT: FAIL\n'; exit 1
fi
left="$(q -At -c "select (select count(*) from auth.users where raw_app_meta_data ? 'devloop_test') + (select count(*) from public.posts where title like '%zzqx%')")"
[[ "$left" == "0" ]] || { echo "test rows were left behind ($left)"; exit 1; }
printf '\nRESULT: PASS (no test rows left behind)\n'
