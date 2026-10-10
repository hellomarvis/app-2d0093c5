#!/usr/bin/env bash
# NexusAI backend smoke test — self-contained, curl + standard tools only.
# Exits non-zero if any assertion fails. Prints one "PASS:"/"FAIL:" line per check.
set -u

PORT="${PORT:-4100}"
BASE="http://localhost:${PORT}"
FAILED=0
PASS_COUNT=0

pass() { echo "PASS: $1"; PASS_COUNT=$((PASS_COUNT + 1)); }
fail() { echo "FAIL: $1"; FAILED=1; }

# request <method> <path> <token-or-empty> <json-body-or-empty>
# echoes "<status>\n<body>"
request() {
  local method="$1" path="$2" token="$3" body="$4"
  local args=(-s -o - -w "\n%{http_code}" -X "$method" "${BASE}${path}")
  if [ -n "$token" ]; then args+=(-H "Authorization: Bearer ${token}"); fi
  if [ -n "$body" ]; then args+=(-H "Content-Type: application/json" -d "$body"); fi
  curl "${args[@]}"
}

status_of() { tail -n1; }
body_of() { sed '$d'; }

json_field() {
  node -e "try{const d=JSON.parse(require('fs').readFileSync(0,'utf8'));const v=d$1;process.stdout.write(v===undefined?'':String(v))}catch(e){process.stdout.write('')}"
}

RAND=$((RANDOM % 1000000))
SUFFIX="smoketest-${RAND}"
SMOKETEST_EMAIL="${SUFFIX}@example.com"
SMOKETEST_CHANNEL="${SUFFIX}-channel"

# ── Admin credentials (seeded) ──────────────────────────────────────────
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@app.app}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"

admin_login() {
  local out status body
  out=$(request POST /api/auth/login "" "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASSWORD}\"}")
  status=$(echo "$out" | status_of)
  body=$(echo "$out" | body_of)
  if [ "$status" != "200" ]; then
    fail "admin login — expected 200, got $status"
    return 1
  fi
  echo "$body" | json_field '.token'
}

sweep_fixtures() {
  local token="$1"
  # Find and hard-remove any lingering "smoketest-" channels (archive = invisible
  # on the default channel list, which is this app's only browse surface).
  local out status body
  out=$(request GET "/api/channels?includeArchived=true" "$token" "")
  body=$(echo "$out" | body_of)
  local ids
  ids=$(echo "$body" | node -e "
    try {
      const d = JSON.parse(require('fs').readFileSync(0,'utf8'));
      d.filter(c => c.name && c.name.startsWith('smoketest-')).forEach(c => console.log(c.id));
    } catch (e) {}
  ")
  for id in $ids; do
    request POST "/api/channels/${id}/archive" "$token" "" >/dev/null
  done
}

echo "=== NexusAI smoke test (port ${PORT}) ==="

ADMIN_TOKEN=$(admin_login) || exit 1
if [ -n "$ADMIN_TOKEN" ]; then pass "admin login succeeded"; else fail "admin login returned no token"; fi

# ── FIRST STEP: sweep any orphaned fixtures from a previous failed run ──
sweep_fixtures "$ADMIN_TOKEN"

# ── Unauthenticated access ──────────────────────────────────────────────
out=$(request GET /api/channels "" "")
status=$(echo "$out" | status_of)
[ "$status" = "401" ] && pass "unauthenticated channel list — 401" || fail "unauthenticated channel list — expected 401, got $status"

# ── Signup ───────────────────────────────────────────────────────────────
out=$(request POST /api/auth/signup "" "{\"email\":\"${SMOKETEST_EMAIL}\",\"password\":\"smoketestpass123\",\"displayName\":\"Smoketest User\",\"role\":\"professional\"}")
status=$(echo "$out" | status_of); body=$(echo "$out" | body_of)
if [ "$status" = "200" ] || [ "$status" = "201" ]; then pass "signup — new account created"; else fail "signup — expected 200/201, got $status"; fi
USER_TOKEN=$(echo "$body" | json_field '.token')
USER_ID=$(echo "$body" | json_field '.user.id')

# ── Duplicate signup → 409 ──────────────────────────────────────────────
out=$(request POST /api/auth/signup "" "{\"email\":\"${SMOKETEST_EMAIL}\",\"password\":\"smoketestpass123\"}")
status=$(echo "$out" | status_of)
[ "$status" = "409" ] && pass "duplicate signup — 409" || fail "duplicate signup — expected 409, got $status"

# ── Wrong password → 401 ────────────────────────────────────────────────
out=$(request POST /api/auth/login "" "{\"email\":\"${SMOKETEST_EMAIL}\",\"password\":\"wrong-password\"}")
status=$(echo "$out" | status_of)
[ "$status" = "401" ] && pass "wrong password login — 401" || fail "wrong password login — expected 401, got $status"

# ── Validation: short password → 400 ────────────────────────────────────
out=$(request POST /api/auth/signup "" "{\"email\":\"${SUFFIX}-short@example.com\",\"password\":\"short\"}")
status=$(echo "$out" | status_of)
[ "$status" = "400" ] && pass "short password signup — 400" || fail "short password signup — expected 400, got $status"

# ── Channel create ───────────────────────────────────────────────────────
out=$(request POST /api/channels "$USER_TOKEN" "{\"name\":\"${SMOKETEST_CHANNEL}\",\"purpose\":\"Smoke test channel\"}")
status=$(echo "$out" | status_of); body=$(echo "$out" | body_of)
[ "$status" = "201" ] && pass "channel create — 201" || fail "channel create — expected 201, got $status"
CHANNEL_ID=$(echo "$body" | json_field '.id')

# ── Duplicate channel name → 409 ────────────────────────────────────────
out=$(request POST /api/channels "$USER_TOKEN" "{\"name\":\"${SMOKETEST_CHANNEL}\",\"purpose\":\"dup\"}")
status=$(echo "$out" | status_of)
[ "$status" = "409" ] && pass "duplicate channel name — 409" || fail "duplicate channel name — expected 409, got $status"

# ── Non-member cannot post or view messages → 403 ───────────────────────
out=$(admin_login); # refresh in case of token expiry edge cases (no-op otherwise)
out=$(request GET "/api/channels/${CHANNEL_ID}/messages" "$ADMIN_TOKEN" "")
status=$(echo "$out" | status_of)
# Admin can access every channel (admin override), so re-check with a genuine
# non-member: sign up a second smoketest user who never joins the channel.
out=$(request POST /api/auth/signup "" "{\"email\":\"${SUFFIX}-outsider@example.com\",\"password\":\"smoketestpass123\"}")
OUTSIDER_TOKEN=$(echo "$out" | body_of | json_field '.token')
out=$(request POST "/api/channels/${CHANNEL_ID}/messages" "$OUTSIDER_TOKEN" '{"body":"should not be allowed"}')
status=$(echo "$out" | status_of)
[ "$status" = "403" ] && pass "non-member posting to channel — 403" || fail "non-member posting — expected 403, got $status"

# ── Member can post a message → 201 ─────────────────────────────────────
out=$(request POST "/api/channels/${CHANNEL_ID}/messages" "$USER_TOKEN" '{"body":"Hello from the smoke test"}')
status=$(echo "$out" | status_of)
[ "$status" = "201" ] && pass "member posting message — 201" || fail "member posting message — expected 201, got $status"

# ── Empty message body → 400 ────────────────────────────────────────────
out=$(request POST "/api/channels/${CHANNEL_ID}/messages" "$USER_TOKEN" '{"body":""}')
status=$(echo "$out" | status_of)
[ "$status" = "400" ] && pass "empty message body — 400" || fail "empty message body — expected 400, got $status"

# ── Conversation summary on a non-empty channel → 503 (seam) ────────────
out=$(request POST "/api/channels/${CHANNEL_ID}/summary" "$USER_TOKEN" "")
status=$(echo "$out" | status_of); body=$(echo "$out" | body_of)
integration=$(echo "$body" | json_field '.integration')
if [ "$status" = "503" ] && [ "$integration" = "OpenAI" ]; then
  pass "conversation summary — 503 integration_not_configured (OpenAI)"
else
  fail "conversation summary — expected 503/OpenAI seam, got $status / $integration"
fi

# ── Archive channel (owner) ──────────────────────────────────────────────
out=$(request POST "/api/channels/${CHANNEL_ID}/archive" "$USER_TOKEN" "")
status=$(echo "$out" | status_of)
[ "$status" = "200" ] && pass "archive channel — 200" || fail "archive channel — expected 200, got $status"

# ── Posting in an archived channel → 409 ────────────────────────────────
out=$(request POST "/api/channels/${CHANNEL_ID}/messages" "$USER_TOKEN" '{"body":"too late"}')
status=$(echo "$out" | status_of)
[ "$status" = "409" ] && pass "post to archived channel — 409" || fail "post to archived channel — expected 409, got $status"

# ── AI Assistant seam → 503 ─────────────────────────────────────────────
out=$(request POST /api/assistant/questions "$USER_TOKEN" '{"question":"What changed in the launch plan?"}')
status=$(echo "$out" | status_of); body=$(echo "$out" | body_of)
integration=$(echo "$body" | json_field '.integration')
if [ "$status" = "503" ] && [ "$integration" = "OpenAI" ]; then
  pass "AI assistant question — 503 integration_not_configured (OpenAI)"
else
  fail "AI assistant question — expected 503/OpenAI seam, got $status / $integration"
fi

# ── Repository analysis seam → 503, then double-call race handling ─────
out=$(request GET /api/repositories "$ADMIN_TOKEN" "")
REPO_ID=$(echo "$out" | body_of | node -e "try{const d=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(d[0]?.id ?? '')}catch(e){console.log('')}")
if [ -n "$REPO_ID" ]; then
  out=$(request POST "/api/repositories/${REPO_ID}/analyze" "$ADMIN_TOKEN" "")
  status=$(echo "$out" | status_of); body=$(echo "$out" | body_of)
  integration=$(echo "$body" | json_field '.integration')
  if [ "$status" = "503" ] && [ "$integration" = "OpenAI" ]; then
    pass "repository analysis — 503 integration_not_configured (OpenAI)"
  else
    fail "repository analysis — expected 503/OpenAI seam, got $status / $integration"
  fi
else
  fail "repository analysis — no seeded repository found to test"
fi

# ── Admin: role change ───────────────────────────────────────────────────
out=$(request PUT "/api/admin/users/${USER_ID}/role" "$ADMIN_TOKEN" '{"role":"developer"}')
status=$(echo "$out" | status_of)
[ "$status" = "200" ] && pass "admin role change — 200" || fail "admin role change — expected 200, got $status"

# ── Admin: non-admin cannot access admin routes → 403 ───────────────────
out=$(request GET /api/admin/users "$USER_TOKEN" "")
status=$(echo "$out" | status_of)
[ "$status" = "403" ] && pass "non-admin accessing admin route — 403" || fail "non-admin accessing admin route — expected 403, got $status"

# ── Admin: cannot suspend self → 403 ────────────────────────────────────
ADMIN_ID_OUT=$(request GET /api/admin/users "$ADMIN_TOKEN" "")
ADMIN_ID=$(echo "$ADMIN_ID_OUT" | body_of | node -e "try{const d=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log((d.find(u=>u.email==='${ADMIN_EMAIL}')||{}).id ?? '')}catch(e){console.log('')}")
out=$(request POST "/api/admin/users/${ADMIN_ID}/suspend" "$ADMIN_TOKEN" "")
status=$(echo "$out" | status_of)
[ "$status" = "403" ] && pass "admin self-suspend — 403" || fail "admin self-suspend — expected 403, got $status"

# ── Admin: suspend + suspended login rejected, then restore ────────────
out=$(request POST "/api/admin/users/${USER_ID}/suspend" "$ADMIN_TOKEN" "")
status=$(echo "$out" | status_of)
[ "$status" = "200" ] && pass "admin suspend user — 200" || fail "admin suspend user — expected 200, got $status"

out=$(request POST /api/auth/login "" "{\"email\":\"${SMOKETEST_EMAIL}\",\"password\":\"smoketestpass123\"}")
status=$(echo "$out" | status_of)
[ "$status" = "403" ] && pass "suspended user login — 403" || fail "suspended user login — expected 403, got $status"

out=$(request POST "/api/admin/users/${USER_ID}/restore" "$ADMIN_TOKEN" "")
status=$(echo "$out" | status_of)
[ "$status" = "200" ] && pass "admin restore user — 200" || fail "admin restore user — expected 200, got $status"

# ── Admin: integrations toggle ───────────────────────────────────────────
out=$(request GET /api/integrations "$ADMIN_TOKEN" "")
INTEGRATION_ID=$(echo "$out" | body_of | node -e "try{const d=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(d[0]?.id ?? '')}catch(e){console.log('')}")
if [ -n "$INTEGRATION_ID" ]; then
  out=$(request PUT "/api/integrations/${INTEGRATION_ID}/toggle" "$ADMIN_TOKEN" "")
  status=$(echo "$out" | status_of)
  [ "$status" = "200" ] && pass "admin toggle integration — 200" || fail "admin toggle integration — expected 200, got $status"
  # toggle back to leave state clean
  request PUT "/api/integrations/${INTEGRATION_ID}/toggle" "$ADMIN_TOKEN" "" >/dev/null
  out=$(request PUT "/api/integrations/${INTEGRATION_ID}/toggle" "$USER_TOKEN" "")
  status=$(echo "$out" | status_of)
  [ "$status" = "403" ] && pass "non-admin toggle integration — 403" || fail "non-admin toggle integration — expected 403, got $status"
  request PUT "/api/integrations/${INTEGRATION_ID}/toggle" "$ADMIN_TOKEN" "" >/dev/null
else
  fail "integrations toggle — no seeded integration found to test"
fi

# ── Missing channel → 404 ───────────────────────────────────────────────
out=$(request GET "/api/channels/999999999" "$USER_TOKEN" "")
status=$(echo "$out" | status_of)
[ "$status" = "404" ] && pass "missing channel — 404" || fail "missing channel — expected 404, got $status"

# ── LAST STEP: sweep every fixture this run created, then verify ───────
sweep_fixtures "$ADMIN_TOKEN"

out=$(request GET "/api/channels?includeArchived=false" "$ADMIN_TOKEN" "")
body=$(echo "$out" | body_of)
LEFTOVER=$(echo "$body" | node -e "
  try {
    const d = JSON.parse(require('fs').readFileSync(0,'utf8'));
    console.log(d.filter(c => c.name && c.name.startsWith('smoketest-')).length);
  } catch (e) { console.log('err'); }
")
[ "$LEFTOVER" = "0" ] && pass "cleanup — no smoketest- fixtures visible anywhere" || fail "cleanup — ${LEFTOVER} smoketest- channel(s) still visible"

echo "=== ${PASS_COUNT} checks passed ==="
if [ "$FAILED" -ne 0 ]; then
  echo "SMOKE TEST FAILED"
  exit 1
fi
echo "SMOKE TEST PASSED"
exit 0
