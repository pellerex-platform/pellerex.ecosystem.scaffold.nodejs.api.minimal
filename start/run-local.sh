#!/bin/bash

# Run the NestJS API locally, reading secrets from the SAME key-per-file layout
# as production: a local directory (~/.pellerex/secrets/<product>) that stands in
# for the CSI /mnt/secrets-store mount. ContainerMode=true makes the app read the
# mount via the exact code path it uses in the cluster (loadSecretsFromMount), so
# local behaviour mirrors prod. The app resolves the path only from
# SECRETS_MOUNT_PATH (no '~' in code), so this works the same on macOS/Linux; a
# .ps1 companion sets the same vars on Windows.
set -e

cd "$(dirname "$0")/.."

SECRETS_DIR="$HOME/.pellerex/secrets/RepoUniqueNormalisedIdentifier"

if [ ! -d "$SECRETS_DIR" ] || [ -z "$(ls -A "$SECRETS_DIR" 2>/dev/null)" ]; then
    echo "⚠️  Local secrets not found — running setup-secrets.sh ..."
    ./start/setup-secrets.sh
fi

export APP_ENV=development
export PORT=8890
export ContainerMode=true
export SECRETS_MOUNT_PATH="$SECRETS_DIR"

if [ ! -d node_modules ]; then
    echo "📦 Installing dependencies ..."
    npm ci || npm install
fi

echo "🌟 Starting NestJS on http://localhost:$PORT  (secrets: $SECRETS_MOUNT_PATH)"
echo "   Health:        http://localhost:$PORT/health/ready"
echo "   Hello:         http://localhost:$PORT/hello"
echo "   Secret status: http://localhost:$PORT/hello/secret-status"
npm run start:dev
