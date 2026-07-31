import * as Joi from 'joi';

/**
 * Boot-time validation of the process environment (NODE-D22 — validate at boot,
 * fail fast). `@nestjs/config` runs this against `process.env` during module init;
 * a violation aborts startup before the app serves a single request.
 */
export const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  APP_ENV: Joi.string()
    .valid('development', 'staging', 'qualityassurance', 'production')
    .default('development'),
  PORT: Joi.number().default(<port-number>),
  ContainerMode: Joi.string().valid('true', 'false').default('false'),
  SECRETS_MOUNT_PATH: Joi.string().optional(),
  APPLICATIONINSIGHTS_CONNECTION_STRING: Joi.string().optional().allow(''),
  DbConnectionString: Joi.string().optional().allow(''),
  // Logging overrides (env beats config.{env}.json — see configuration.ts).
  LOG_LEVEL: Joi.string()
    .valid('trace', 'debug', 'info', 'warn', 'error', 'fatal')
    .optional(),
  LOG_FILE_ENABLED: Joi.string().valid('true', 'false').optional(),
  LOG_FILE_DIRECTORY: Joi.string().optional(),
  LOG_RETENTION_DAYS: Joi.number().optional(),
}).unknown(true);

export const validationOptions = {
  abortEarly: false,
};
