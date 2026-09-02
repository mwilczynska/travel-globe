#!/usr/bin/env bash
#
# Refuse to publish a tree that carries private information.
#
#   scripts/check-public-safe.sh [ref]     # default: HEAD
#
# Exits 0 if the ref looks safe to push to a public remote, non-zero otherwise.
# Run it before every push to the public repository:
#
#   scripts/check-public-safe.sh public && git push public public:main
#
# Why this exists: this project is developed in a private repository whose
# history contains personal photographs and server details, and published from a
# separate history-free branch. The two are one `git checkout` apart, so "push
# the right branch" is a rule that works until the day it doesn't. This makes it
# mechanical.
#
# The deployment-specific strings to search for are NOT in this file. A
# leak-checker that hardcodes the secrets it looks for leaks them itself. They
# live in .public-blocklist, which is gitignored. See .public-blocklist.example.

set -uo pipefail

REF="${1:-HEAD}"
BLOCKLIST="$(git rev-parse --show-toplevel)/.public-blocklist"
FAILED=0

red()  { printf '\033[31m%s\033[0m\n' "$*"; }
grn()  { printf '\033[32m%s\033[0m\n' "$*"; }
ylw()  { printf '\033[33m%s\033[0m\n' "$*"; }

fail() { red   "  FAIL  $*"; FAILED=1; }
pass() { grn   "  ok    $*"; }
warn() { ylw   "  warn  $*"; }

# Resolve to a commit id up front. A branch and a remote can share a name
# (`public` is both here), which makes git warn about an ambiguous refname on
# every single command; a resolved sha is unambiguous.
if ! SHA=$(git rev-parse --verify --quiet "${REF}^{commit}"); then
  red "No such ref: $REF"
  exit 2
fi

echo "Checking '$REF' (${SHA:0:9}) for anything that should not be published"
echo

# --- 1. Deployment-specific strings ------------------------------------------
# One extended-regex per line in .public-blocklist; blank lines and # comments
# are ignored.
if [[ -f "$BLOCKLIST" ]]; then
  hits=0
  while IFS= read -r pattern; do
    [[ -z "$pattern" || "$pattern" == \#* ]] && continue
    # The example blocklist is excluded by design: it is a committed file whose
    # entire content is placeholder patterns, so it will always look like a
    # match. Nothing else is exempt.
    if match=$(git grep -I -n -iE "$pattern" "$SHA" -- . ':!.public-blocklist.example' 2>/dev/null); then
      fail "blocklist pattern matched: $pattern"
      echo "$match" | head -5 | sed 's/^/          /'
      hits=1
    fi
  done < "$BLOCKLIST"

  # Commit messages are published too, and are easy to forget.
  while IFS= read -r pattern; do
    [[ -z "$pattern" || "$pattern" == \#* ]] && continue
    if git log --format='%s%n%b' "$SHA" | grep -qiE "$pattern"; then
      fail "blocklist pattern in a commit message: $pattern"
      hits=1
    fi
  done < "$BLOCKLIST"

  [[ $hits -eq 0 ]] && pass "no blocklisted strings in files or commit messages"
else
  warn "no .public-blocklist found, skipping the private-string check"
  warn "copy .public-blocklist.example to .public-blocklist and fill it in"
fi

# --- 2. File types that must never be published ------------------------------
# Databases, real env files, keys and certificates. .env.example is a template
# and is allowed.
if secrets=$(git ls-tree -r --name-only "$SHA" \
    | grep -iE '\.(db|db-wal|db-shm|sqlite|sqlite3|pem|key|crt|cer|p12|pfx|keystore)$|(^|/)\.env(\.|$)' \
    | grep -vE '(^|/)\.env\.example$'); then
  fail "files that must not be published:"
  echo "$secrets" | sed 's/^/          /'
else
  pass "no databases, env files, keys or certificates"
fi

# --- 3. Directories known to hold private media ------------------------------
if private=$(git ls-tree -r --name-only "$SHA" | grep -iE '(^|/)(test-pics|uploads|data)/'); then
  fail "private media/data directories present:"
  echo "$private" | sed 's/^/          /'
else
  pass "no private media or data directories"
fi

# --- 4. IPv4 literals --------------------------------------------------------
# Catches a server address someone pasted in and forgot to blocklist. Loopback,
# unspecified, and the RFC 5737 documentation ranges are allowed.
#
# Octets are matched as 0-255 rather than [0-9]{1,3}: the loose form matches
# runs of numbers inside SVG path data (a real example from this project's
# icons: "2.37.996.608"), which made the check cry wolf on a clean tree.
OCTET='(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])'
if ips=$(git grep -I -hoE "\b($OCTET\.){3}$OCTET\b" "$SHA" -- . 2>/dev/null \
    | grep -vE '^(127\.0\.0\.1|0\.0\.0\.0|255\.255\.255\.255|192\.0\.2\.[0-9]+|198\.51\.100\.[0-9]+|203\.0\.113\.[0-9]+|1\.2\.3\.4|8\.8\.8\.8)$' \
    | sort -u); then
  fail "IPv4 literals found. Confirm none is a real host:"
  echo "$ips" | sed 's/^/          /'
else
  pass "no unexpected IPv4 literals"
fi

# --- 5. Oversized files ------------------------------------------------------
# Not a leak, but a large binary is usually something that slipped in.
big=$(git ls-tree -r -l "$SHA" | awk '$4 ~ /^[0-9]+$/ && $4 > 2097152 {printf "%s (%.1f MB)\n", $5, $4/1048576}')
if [[ -n "$big" ]]; then
  warn "files larger than 2 MB:"
  echo "$big" | sed 's/^/          /'
else
  pass "no files over 2 MB"
fi

echo
if [[ $FAILED -eq 0 ]]; then
  grn "PASS - '$REF' looks safe to publish"
else
  red "BLOCKED - do not push '$REF'"
fi
exit $FAILED
