#!/bin/bash

# In production, secrets are mounted key-per-file by the Azure Key Vault CSI
# driver at /mnt/secrets-store (one file per secret). For local development we
# emulate that layout exactly: one file per secret in a shared local directory,
# pointed at by SECRETS_MOUNT_PATH (see start/run-local.sh). This is the same
# convention every non-.NET Pellerex scaffold uses.
set -e

SECRETS_DIR="$HOME/.pellerex/secrets/RepoUniqueNormalisedIdentifier"

echo "🔐 Setting up local secrets for RepoUniqueNormalisedIdentifier..."
mkdir -p "$SECRETS_DIR"

# Write one file per secret (key = file name, value = file contents).
write_secret() {
    local key="$1"
    local value="$2"
    if [ ! -f "$SECRETS_DIR/$key" ]; then
        printf '%s' "$value" > "$SECRETS_DIR/$key"
        echo "📝 Created secret: $key"
    fi
}

write_secret "DbConnectionString" "Server=localhost;Database=RepoUniqueNormalisedIdentifier;User Id=sa;Password=YourPassword123!;TrustServerCertificate=True;"
write_secret "APISecretKey" "your-secret-key-here-change-in-production"
write_secret "Environment" "development"

# Lock down permissions (owner-only).
chmod 700 "$SECRETS_DIR"
chmod 600 "$SECRETS_DIR"/* 2>/dev/null || true

echo "🔒 Local secrets ready at $SECRETS_DIR (one file per secret)"
echo "   Point the app at them: export SECRETS_MOUNT_PATH=\"$SECRETS_DIR\""
