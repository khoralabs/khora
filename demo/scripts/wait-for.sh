#!/usr/bin/env sh
# Usage: wait-for.sh <url> [timeout_seconds]
url="${1:?url required}"
max="${2:-120}"
t=0
while ! bun -e "fetch(process.argv[1]).then(async r=>{if(!r.ok)process.exit(1);await r.text();process.exit(0)}).catch(()=>process.exit(1))" "$url" >/dev/null 2>&1; do
  t=$((t + 1))
  if test "$t" -ge "$max"; then
    echo "wait-for: timeout waiting for $url" >&2
    exit 1
  fi
  sleep 1
done
