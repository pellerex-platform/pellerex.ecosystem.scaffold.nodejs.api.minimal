import * as fs from 'fs';
import * as path from 'path';

/**
 * Resolves the application environment used to pick `config.{env}.json`.
 *
 * `APP_ENV` selects the config file (development | staging | qualityassurance |
 * production). It is intentionally separate from `NODE_ENV`, which only carries
 * the Node runtime mode (`production` in every deployed environment — NODE-D14).
 */
export function resolveAppEnv(): string {
  return process.env.APP_ENV || process.env.NODE_ENV || 'development';
}

/** Reads and parses the tokenised `config.{env}.json` shipped in the image. */
export function loadConfigFile(): Record<string, any> {
  const env = resolveAppEnv();
  const file = path.join(process.cwd(), `config.${env}.json`);
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, any>;
    }
    // eslint-disable-next-line no-console
    console.warn(`[config] config file not found: ${file}`);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`[config] failed to read ${file}:`, error);
  }
  return {};
}

/**
 * NODE-D6 — read Key Vault secrets from the CSI driver's in-memory tmpfs file
 * mount, key-per-file (the Node equivalent of .NET `AddKeyPerFile`). Each secret
 * is a separate file whose name is the key and whose content is the value. The
 * tmpfs mount never touches etcd and is not exposed in the process env.
 *
 * Only active in container mode; for local development secrets come from
 * `config.{env}.json` / env vars instead.
 */
export function loadSecretsFromMount(): Record<string, string> {
  const secrets: Record<string, string> = {};

  const containerMode = process.env.ContainerMode === 'true';
  if (!containerMode) {
    return secrets;
  }

  const mountPath = process.env.SECRETS_MOUNT_PATH || '/mnt/secrets-store';
  try {
    if (!fs.existsSync(mountPath)) {
      // eslint-disable-next-line no-console
      console.warn(`[secrets] mount path not found: ${mountPath}`);
      return secrets;
    }

    for (const entry of fs.readdirSync(mountPath)) {
      // CSI may surface symlinks under ..data; only read regular files / symlinks to files.
      if (entry.startsWith('..')) {
        continue;
      }
      const full = path.join(mountPath, entry);
      try {
        if (fs.statSync(full).isFile()) {
          secrets[entry] = fs.readFileSync(full, 'utf-8').trim();
        }
      } catch {
        // skip unreadable entries
      }
    }

    // eslint-disable-next-line no-console
    console.log(
      `[secrets] loaded ${Object.keys(secrets).length} secret(s) from ${mountPath}: ${Object.keys(secrets).join(', ')}`,
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[secrets] error reading mount:', error);
  }

  return secrets;
}

/** True if the value still contains an unsubstituted scaffold token, e.g. `<staging-keyvault-name>`. */
export function isUnsubstitutedToken(value: unknown): boolean {
  return typeof value === 'string' && /<[a-z0-9-]+>/i.test(value);
}
