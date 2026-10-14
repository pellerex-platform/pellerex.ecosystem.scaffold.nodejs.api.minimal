/**
 * One thing the app cannot work without, such as its database. `test` resolves
 * when the thing works and rejects, saying why, when it does not. It is given 10
 * seconds, then it has failed. A new app has none: add one to `HEALTH_CHECKS` in
 * `health.module.ts`.
 */
export interface HealthCheck {
  /** The name the health test's log line gives this check, such as `database`. */
  name: string;
  test: () => Promise<unknown>;
}

/** The checks the health test runs (`HealthTester`), provided by `HealthModule`. */
export const HEALTH_CHECKS = Symbol('HEALTH_CHECKS');
