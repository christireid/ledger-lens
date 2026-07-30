#!/usr/bin/env bash
# Architecture grep audits — spec §04.13 / §06.12.
# Each check greps for a banned pattern; any hit fails the build.
set -euo pipefail

cd "$(dirname "$0")/.."

fail=0

check() {
  local name="$1"; shift
  local hits
  hits=$("$@" || true)
  if [[ -n "$hits" ]]; then
    echo "ARCH FAIL: $name"
    echo "$hits"
    fail=1
  fi
}

# 1. Raw hex colors outside globals.css (§04.13)
check "raw hex colors outside globals.css" \
  grep -rnE --include='*.tsx' --include='*.ts' --include='*.css' \
    --exclude=globals.css --exclude-dir=node_modules \
    -e '(color|background|fill|stroke|border)[^;{]{0,20}#[0-9a-fA-F]{3,8}\b' src

# 2. Arbitrary Tailwind COLOR/SPACING values, e.g. p-[13px], bg-[#fff] (§04.13).
# Sizing constraints (max-w-[1440px] is the §03.4 shell spec) are not banned.
check "arbitrary Tailwind color values" \
  grep -rnE --include='*.tsx' \
    '(bg|text|border|from|to|via|fill|stroke|ring)-\[#' src
check "arbitrary Tailwind spacing values" \
  grep -rnE --include='*.tsx' \
    "[\"' ]-?(p|m)(x|y|t|b|l|r|s|e)?-\[[0-9]+(px|rem)\]|gap-\[|space-(x|y)-\[" src

# 3. style= outside chart geometry (§04.13) — charts dir exempt
check "inline style outside chart geometry" \
  grep -rn --include='*.tsx' 'style={{' src --exclude-dir=charts

# 4. @apply in component styles (§04.4) — globals.css owns the only allowed uses
check "@apply outside globals.css" \
  grep -rn --include='*.css' '@apply' src --exclude=globals.css

# 5. Raw query keys — useQuery/useMutation with inline array keys (§06.5.1)
check "hand-written query keys" \
  grep -rnE --include='*.tsx' --include='*.ts' \
    'queryKey:\s*\[' src --exclude-dir=api

# 6. server/ imports from client components (§06.3 — belt to the 'server-only' braces)
check "server/ import inside 'use client' modules" \
  bash -c "grep -rl --include='*.tsx' --include='*.ts' \"^[\\\"']use client[\\\"']\" src | xargs -r grep -ln '@/server/' || true"

if [[ $fail -ne 0 ]]; then
  echo "Architecture grep audits failed."
  exit 1
fi
echo "Architecture grep audits passed."

# §22.7-1: no direct OpenAI access outside the transport gateway (§07.8).
if grep -rn "api.openai.com" src --include="*.ts" --include="*.tsx" | grep -v "server/ai/transport.ts" | grep -q .; then
  echo "arch-grep FAIL: OpenAI reachable outside src/server/ai/transport.ts (§07.8)"
  grep -rn "api.openai.com" src --include="*.ts" --include="*.tsx" | grep -v "server/ai/transport.ts"
  exit 1
fi
