#!/bin/sh
# Vercel "Ignored Build Step" (wired up via `ignoreCommand` in vercel.json).
#
# Exit 0 = skip the build, exit 1 = build. Inverted on purpose by Vercel; the
# command answers "should this be ignored?".
#
# Only two branches produce deployments: `main` is Production and `preview` is
# Preview. Everything else is skipped so that feature branches do not mint
# throwaway preview URLs — each one would need its own entry in the Meta app's
# OAuth redirect allow-list to be usable, and none of them would get one.
#
# A deploy with no branch (`vercel deploy` from a laptop, a redeploy from the
# dashboard) is always built: there is no branch to judge, and blocking it
# would break the documented rollback path.
set -eu

branch="${VERCEL_GIT_COMMIT_REF:-}"

if [ -z "$branch" ]; then
  echo "No VERCEL_GIT_COMMIT_REF (manual deploy) — building."
  exit 1
fi

case "$branch" in
  main | preview)
    echo "Branch '$branch' is a deploying branch — building."
    exit 1
    ;;
  *)
    echo "Branch '$branch' does not deploy (only main + preview) — skipping."
    exit 0
    ;;
esac
