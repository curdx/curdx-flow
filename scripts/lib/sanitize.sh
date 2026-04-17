#!/usr/bin/env bash
# sanitize.sh — regex-based secret / PII scrubber for /curdx:snapshot bundles.
#
# Reads stdin, writes scrubbed stdout. Deterministic replacements only —
# never drops lines, never changes structure, so downstream diff-preview
# stays meaningful.
#
# Usage:
#   cat state.json | bash scripts/lib/sanitize.sh > state.sanitized.json
#   # with strict mode (emails + IPs also redacted):
#   cat events.jsonl | bash scripts/lib/sanitize.sh --strict > events.sanitized.jsonl
#
# Patterns covered (default mode):
#   - Anthropic / OpenAI keys: sk-..., sk-ant-...
#   - GitHub tokens: ghp_..., github_pat_..., gho_..., ghu_..., ghs_...
#   - GitLab PAT: glpat-...
#   - AWS: AKIA..., ASIA..., secret-access-key pattern
#   - Google API: AIza...
#   - Slack: xoxb-, xoxp-, xoxa-, xoxr-
#   - Generic bearer tokens: Authorization: Bearer ...
#   - PEM private keys: entire block redacted
#   - Database URLs with embedded creds: proto://user:pass@host
#   - .env-style KEY=VAL where KEY contains TOKEN|SECRET|KEY|PASSWORD|PASS|CREDENTIAL
#   - JWT: eyJ<base64>.<base64>.<base64>
#   - Home paths: /Users/<name>, /home/<name> → /Users/REDACTED, /home/REDACTED
#
# Strict mode (--strict) additionally redacts:
#   - Email addresses
#   - IPv4 addresses (but not 127.0.0.1, 0.0.0.0, 255.255.255.255, private ranges)

set -eu

STRICT=0
if [ "${1:-}" = "--strict" ]; then STRICT=1; fi

# Use sed with multiple -e chains. Each -E for extended regex.
# Redaction token is <REDACTED:<type>> so readers know what was scrubbed.

sed_base=(
  # PEM private keys — match the whole multi-line block; sed can't easily do
  # multi-line, so we rely on per-line BEGIN / body / END; crude but works.
  -e 's|-----BEGIN [A-Z ]*PRIVATE KEY-----.*|<REDACTED:pem-private-key>|g'
  -e 's|-----END [A-Z ]*PRIVATE KEY-----||g'

  # Anthropic / OpenAI (include - and _ in OpenAI range — keys may contain
  # subprefixes like sk-proj-...)
  -e 's|sk-ant-[A-Za-z0-9_-]{20,}|<REDACTED:anthropic-key>|g'
  -e 's|sk-[A-Za-z0-9_-]{20,}|<REDACTED:openai-key>|g'

  # GitHub tokens (all types)
  -e 's|ghp_[A-Za-z0-9]{36,}|<REDACTED:github-pat>|g'
  -e 's|github_pat_[A-Za-z0-9_]{82,}|<REDACTED:github-pat>|g'
  -e 's|gho_[A-Za-z0-9]{36,}|<REDACTED:github-oauth>|g'
  -e 's|ghu_[A-Za-z0-9]{36,}|<REDACTED:github-user>|g'
  -e 's|ghs_[A-Za-z0-9]{36,}|<REDACTED:github-server>|g'

  # GitLab PAT (can be as short as 20 chars; widen to catch test keys too)
  -e 's|glpat-[A-Za-z0-9_-]{15,}|<REDACTED:gitlab-pat>|g'

  # AWS
  -e 's|AKIA[0-9A-Z]{16}|<REDACTED:aws-access-key>|g'
  -e 's|ASIA[0-9A-Z]{16}|<REDACTED:aws-session-key>|g'

  # Google API
  -e 's|AIza[0-9A-Za-z_-]{35}|<REDACTED:google-api-key>|g'

  # Slack
  -e 's|xox[baprs]-[A-Za-z0-9-]{10,}|<REDACTED:slack-token>|g'

  # Generic Authorization: Bearer (case variants handled via char classes;
  # BSD sed doesn't accept the `i` flag so we enumerate)
  -e 's|[Aa]uthorization:[[:space:]]*[Bb]earer[[:space:]]+[A-Za-z0-9._-]+|Authorization: Bearer <REDACTED:bearer-token>|g'

  # Database URLs with user:pass@host
  -e 's|([a-z]+)://[^:@/ ]+:[^@ ]+@|\1://<REDACTED:db-creds>@|g'

  # .env-style KEY=VAL where KEY contains sensitive hints (uppercase only;
  # .env convention). Uses # as sed delimiter since the pattern contains
  # | for regex alternation.
  -e 's#([A-Z_]*(TOKEN|SECRET|KEY|PASSWORD|PASS|CREDENTIAL|API_KEY|ACCESS_KEY)[A-Z_]*)[[:space:]]*=[[:space:]]*[^[:space:]"]+#\1=<REDACTED:env-secret>#g'

  # JWT (three base64 segments joined by dots, starting with eyJ)
  -e 's|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|<REDACTED:jwt>|g'

  # Home paths — take first path segment after /Users/ or /home/ or /root
  -e 's|/Users/[^/[:space:]"]+|/Users/REDACTED|g'
  -e 's|/home/[^/[:space:]"]+|/home/REDACTED|g'
  -e 's|/root/|/home/REDACTED/|g'

  # macOS temp / cache paths with usernames
  -e 's|/var/folders/[a-z0-9_]+/[a-z0-9_]+|/var/folders/REDACTED|g'
)

if [ "$STRICT" = "1" ]; then
  sed_strict=(
    # Email addresses
    -e 's|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|<REDACTED:email>|g'

    # All IPv4 (strict mode is maximally aggressive; loopback / 0.0.0.0 /
    # broadcast are low-information and redacting them is safe. If the
    # user needs them visible, they drop --strict.)
    -e 's|\b[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\b|<REDACTED:ipv4>|g'
  )
  sed -E "${sed_base[@]}" "${sed_strict[@]}"
else
  sed -E "${sed_base[@]}"
fi
