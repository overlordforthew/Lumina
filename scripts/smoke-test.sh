#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-https://lumina.namibarden.com}"
PASS=0
FAIL=0
TOTAL=0

result() {
  local status="$1"
  local label="$2"
  local detail="$3"
  TOTAL=$((TOTAL + 1))
  if [ "$status" = "PASS" ]; then
    PASS=$((PASS + 1))
    printf "[PASS] %s %s\n" "$label" "$detail"
  else
    FAIL=$((FAIL + 1))
    printf "[FAIL] %s %s\n" "$label" "$detail"
  fi
}

test_get_code() {
  local path="$1"
  local expect="$2"
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 12 "${BASE_URL}${path}")
  if [ "$code" = "$expect" ]; then
    result "PASS" "GET ${path}" "(HTTP ${code})"
  else
    result "FAIL" "GET ${path}" "(expected ${expect}, got ${code})"
  fi
}

test_get_contains() {
  local path="$1"
  local expect="$2"
  local body
  body=$(curl -s --max-time 12 "${BASE_URL}${path}")
  if printf '%s' "$body" | grep -Fq "$expect"; then
    result "PASS" "GET ${path}" "(body contains ${expect})"
  else
    result "FAIL" "GET ${path}" "(missing ${expect})"
  fi
}

test_get_code "/" "200"
test_get_code "/robots.txt" "200"
test_get_code "/sitemap.xml" "200"
test_get_contains "/api/auth/session" "null"

analytics_code=$(curl -s -o /tmp/lumina-analytics-smoke.json -w '%{http_code}' --max-time 12 \
  -X POST \
  -H "Content-Type: application/json" \
  -d "{\"event\":\"auth_screen_viewed\",\"session_id\":\"smoke-$(date +%s)\",\"source\":\"smoke\",\"page_path\":\"/\",\"properties\":{\"lang\":\"en\",\"surface\":\"smoke\"}}" \
  "${BASE_URL}/api/analytics/track")

if [ "$analytics_code" = "200" ] && grep -Fq '"ok":true' /tmp/lumina-analytics-smoke.json; then
  result "PASS" "POST /api/analytics/track" "(HTTP ${analytics_code})"
else
  result "FAIL" "POST /api/analytics/track" "(HTTP ${analytics_code})"
fi

echo ""
echo "========================================="
echo "  Smoke test summary: ${PASS}/${TOTAL} tests passed"
echo "========================================="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
