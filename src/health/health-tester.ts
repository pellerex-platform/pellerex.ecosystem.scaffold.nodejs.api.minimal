import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { HEALTH_CHECKS, HealthCheck } from './health-check';

/**
 * How often the test runs. Tenant apps test once a minute, not every 30 seconds
 * as the platform services do: the databases Pellerex creates for them share one
 * pool, so every test of every app adds to it. The chart's Kubernetes checks call
 * once a minute too (infrastructure/Helm/templates/deployment.yaml).
 */
export const TEST_INTERVAL_MS = 60_000;

/** How long one check may take. A check that has not answered by then has failed. */
export const CHECK_TIME_LIMIT_MS = 10_000;

/** What one check of one test found: how long it took and, when it failed, why. */
interface CheckResult {
  name: string;
  milliseconds: number;
  failure?: string;
}

/**
 * Runs the app's health test and keeps its last result. When the app starts and
 * then once a minute it tests every check at the same time, writes one log line
 * saying what was tested and how long each part took, and keeps whether all of
 * them passed. The health addresses answer from that result (`HealthController`),
 * so no number of calls to them costs the checked dependencies anything.
 */
@Injectable()
export class HealthTester implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(HealthTester.name);
  private timer?: NodeJS.Timeout;
  private finished = false;
  private passed = false;

  constructor(@Inject(HEALTH_CHECKS) private readonly checks: HealthCheck[]) {}

  /** Starts the test straight away, without holding up the start of the app. */
  onApplicationBootstrap(): void {
    void this.test();
    this.timer = setInterval(() => void this.test(), TEST_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  /** One health test: every check at the same time, one log line, the result kept. */
  async test(): Promise<void> {
    const results = await Promise.all(
      this.checks.map((check) => this.testCheck(check)),
    );
    const passed = results.every((result) => result.failure === undefined);
    const summary =
      results.length === 0
        ? 'nothing to test'
        : results.map(describe).join(', ');

    if (passed) {
      this.logger.log(`Health test passed: ${summary}`);
    } else {
      this.logger.warn(`Health test failed: ${summary}`);
    }

    this.passed = passed;
    this.finished = true;
  }

  /** Whether the first test has finished, whatever it found. */
  started(): boolean {
    return this.finished;
  }

  /** Whether the last test passed. Before the first test has finished it is false. */
  healthy(): boolean {
    return this.finished && this.passed;
  }

  /**
   * Runs one check. The check reaches something outside the app, such as its
   * database, so its rejection is its answer, not an error of the app; a check
   * that throws before it returns a promise is read the same way.
   */
  private async testCheck(check: HealthCheck): Promise<CheckResult> {
    const start = performance.now();
    let timer: NodeJS.Timeout | undefined;
    const timeUp = new Promise<string>((resolve) => {
      timer = setTimeout(
        () => resolve(`did not answer within ${CHECK_TIME_LIMIT_MS} ms`),
        CHECK_TIME_LIMIT_MS,
      );
    });
    const answer = Promise.resolve()
      .then(() => check.test())
      .then(
        () => undefined,
        (error: unknown) =>
          error instanceof Error ? error.message || error.name : String(error),
      );

    const failure = await Promise.race([answer, timeUp]);
    clearTimeout(timer);
    return {
      name: check.name,
      milliseconds: Math.floor(performance.now() - start),
      failure,
    };
  }
}

/** "database 12 ms", or "database failed after 12 ms (why)". */
function describe(result: CheckResult): string {
  return result.failure === undefined
    ? `${result.name} ${result.milliseconds} ms`
    : `${result.name} failed after ${result.milliseconds} ms (${result.failure})`;
}
