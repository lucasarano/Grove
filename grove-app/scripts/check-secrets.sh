#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

status=0

declare -a rules=(
  "OpenAI/Anthropic API key::sk-[A-Za-z0-9_-]{20,}"
  "Google API key::AIza[0-9A-Za-z_-]{20,}"
  "AWS access key::A(KIA|SIA)[0-9A-Z]{16}"
  "Stripe live or webhook secret::(sk|rk)_live_[A-Za-z0-9]{16,}|whsec_[A-Za-z0-9]{16,}"
  "GitHub token::gh[pousr]_[A-Za-z0-9_]{20,}"
  "Private key block::-----BEGIN (RSA |DSA |EC |OPENSSH |PGP )?PRIVATE KEY-----"
  "Legacy Vite provider key::VITE_(ANTHROPIC|OPENAI)_API_KEY[[:space:]]*=[[:space:]]*[^[:space:]#]+"
  "Secret assignment::(API_KEY|SECRET|TOKEN|PRIVATE_KEY|CLIENT_SECRET)[[:space:]]*=[[:space:]]*[^[:space:]#]{8,}"
  "Quoted secret property::([Aa][Pp][Ii][_-]?[Kk][Ee][Yy]|[Ss][Ee][Cc][Rr][Ee][Tt]|[Tt][Oo][Kk][Ee][Nn]|[Pp][Rr][Ii][Vv][Aa][Tt][Ee][_-]?[Kk][Ee][Yy]|[Cc][Ll][Ii][Ee][Nn][Tt][_-]?[Ss][Ee][Cc][Rr][Ee][Tt])[[:space:]]*[:=][[:space:]]*['\"][^'\"]{12,}['\"]"
)

pathspec=(
  "."
  ":(exclude)**/node_modules/**"
  ":(exclude)**/dist/**"
  ":(exclude)**/build/**"
  ":(exclude)**/.vercel/**"
  ":(exclude)**/.firebase/**"
  ":(exclude)**/*.png"
  ":(exclude)**/*.jpg"
  ":(exclude)**/*.jpeg"
  ":(exclude)**/*.gif"
  ":(exclude)**/*.webp"
  ":(exclude)**/*.pdf"
  ":(exclude)grove-app/package-lock.json"
  ":(exclude)grove-app/functions/package-lock.json"
)

report_matches() {
  local scope="$1"
  local rule="$2"
  shift 2
  local matches=("$@")

  if ((${#matches[@]} == 0)); then
    return
  fi

  status=1
  printf '%s: %s\n' "$scope" "$rule"
  printf '  %s\n' "${matches[@]}"
}

check_worktree() {
  local rule="$1"
  local pattern="$2"
  local matches=()

  while IFS= read -r match; do
    matches+=("$match")
  done < <(git grep -I -l --untracked -E -e "$pattern" -- "${pathspec[@]}" || true)
  if ((${#matches[@]} > 0)); then
    report_matches "Current tree" "$rule" "${matches[@]}"
  fi
}

check_history() {
  local rule="$1"
  local pattern="$2"
  local matches=()
  local revisions=()

  while IFS= read -r revision; do
    revisions+=("$revision")
  done < <(git rev-list --all)
  if ((${#revisions[@]} == 0)); then
    return
  fi

  while IFS= read -r match; do
    matches+=("$match")
  done < <(git grep -I -l -E -e "$pattern" "${revisions[@]}" -- "${pathspec[@]}" || true)
  if ((${#matches[@]} > 0)); then
    report_matches "Git history" "$rule" "${matches[@]}"
  fi
}

for entry in "${rules[@]}"; do
  rule="${entry%%::*}"
  pattern="${entry#*::}"
  check_worktree "$rule" "$pattern"
  check_history "$rule" "$pattern"
done

if ((status != 0)); then
  cat <<'MSG'

Potential secret material was found. The scan intentionally reports only paths
and rule names. Inspect the listed files locally, remove the value, rotate any
key that was committed, and rewrite history before making the repository public.
MSG
  exit "$status"
fi

echo "No secret-shaped values found in tracked files or git history."
