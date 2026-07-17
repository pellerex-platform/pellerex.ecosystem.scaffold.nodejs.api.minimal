import {
  isUnsubstitutedToken,
  loadConfigFile,
  loadSecretsFromMount,
  resolveAppEnv,
} from './config-file';

export interface AppConfig {
  APP_ENV: string;
  NODE_ENV: string;
  /** Hardcoded platform contract port — NOT the `<port-number>` token (NODE-D5). */
  PORT: number;
  appName: string;
  appVersion: string;
  logLevel: string;
  /** Daily-rolling file sinks (Serilog File-sink parity) — see src/logging. */
  logFileEnabled: boolean;
  logFileDirectory: string;
  logRetentionDays: number;
  keyVaultName: string;
  appInsightsConnectionString: string;
  /** Secret read from the CSI tmpfs file mount (NODE-D6). */
  dbConnectionString: string;
  /** Names (never values) of the secrets read from the mount — used by /health/ready. */
  secretsLoaded: string[];
}

/**
 * `@nestjs/config` load factory. Merges the tokenised `config.{env}.json` with the
 * CSI tmpfs file-mount secrets, then fails fast (NODE-D22) if a required value is
 * missing or a tokenised value was never substituted at provisioning time.
 */
export default (): AppConfig => {
  const file = loadConfigFile();
  const secrets = loadSecretsFromMount();
  const appEnv = resolveAppEnv();
  const containerMode = process.env.ContainerMode === 'true';

  const appInsightsConnectionString =
    process.env.APPLICATIONINSIGHTS_CONNECTION_STRING ||
    file?.azure?.applicationInsights?.connectionString ||
    '';

  const keyVaultName = file?.azure?.keyVault?.name || '';

  const config: AppConfig = {
    APP_ENV: appEnv,
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: 8890,
    appName: file?.app?.name || 'nestjs-api',
    appVersion: file?.app?.version || '1.0.0',
    // Logging precedence (config-as-code): env var > config.{env}.json > default.
    logLevel: process.env.LOG_LEVEL || file?.logging?.level || 'info',
    logFileEnabled:
      process.env.LOG_FILE_ENABLED !== undefined
        ? process.env.LOG_FILE_ENABLED === 'true'
        : (file?.logging?.file_enabled ?? true),
    logFileDirectory:
      process.env.LOG_FILE_DIRECTORY || file?.logging?.file_directory || 'logs',
    logRetentionDays: Number(
      process.env.LOG_RETENTION_DAYS || file?.logging?.retention_days || 31,
    ),
    keyVaultName,
    appInsightsConnectionString,
    dbConnectionString:
      secrets.DbConnectionString || process.env.DbConnectionString || '',
    secretsLoaded: Object.keys(secrets),
  };

  // Fail fast (NODE-D22): a half-tokenised config in a deployed environment means
  // provisioning did not substitute a required token — never serve traffic like that.
  if (containerMode) {
    const offenders = [
      ['keyVaultName', config.keyVaultName],
      ['appInsightsConnectionString', config.appInsightsConnectionString],
    ].filter(([, value]) => isUnsubstitutedToken(value));

    if (offenders.length > 0) {
      throw new Error(
        `[config] unsubstituted scaffold token(s) at boot: ${offenders
          .map(([name]) => name)
          .join(', ')} — provisioning tokenisation incomplete.`,
      );
    }
  }

  return config;
};
