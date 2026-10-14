import { Logger } from '@nestjs/common';
import { HealthCheck } from './health-check';
import {
  CHECK_TIME_LIMIT_MS,
  HealthTester,
  TEST_INTERVAL_MS,
} from './health-tester';

describe('HealthTester', () => {
  type Line = { level: 'log' | 'warn'; message: string };
  let lines: Line[];

  beforeEach(() => {
    lines = [];
    jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation((message: unknown) => {
        lines.push({ level: 'log', message: String(message) });
      });
    jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation((message: unknown) => {
        lines.push({ level: 'warn', message: String(message) });
      });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  /** The one line a single test wrote. */
  function onlyLine(): Line {
    expect(lines).toHaveLength(1);
    return lines[0];
  }

  const passing = (name: string): HealthCheck => ({
    name,
    test: () => Promise.resolve(),
  });

  const failing = (name: string, reason: string): HealthCheck => ({
    name,
    test: () => Promise.reject(new Error(reason)),
  });

  it('is neither started nor healthy before the first test', () => {
    const tester = new HealthTester([]);

    expect(tester.started()).toBe(false);
    expect(tester.healthy()).toBe(false);
    expect(lines).toHaveLength(0);
  });

  it('has nothing to test in a new app, and is healthy', async () => {
    const tester = new HealthTester([]);

    await tester.test();

    expect(tester.started()).toBe(true);
    expect(tester.healthy()).toBe(true);
    expect(onlyLine()).toEqual({
      level: 'log',
      message: 'Health test passed: nothing to test',
    });
  });

  it('writes passing checks with how long each took', async () => {
    const tester = new HealthTester([passing('database'), passing('cache')]);

    await tester.test();

    expect(tester.healthy()).toBe(true);
    expect(onlyLine().level).toBe('log');
    expect(onlyLine().message).toMatch(
      /^Health test passed: database \d+ ms, cache \d+ ms$/,
    );
  });

  it('is unhealthy when one check fails, and says what failed and why', async () => {
    const tester = new HealthTester([
      failing('database', 'connection refused'),
      passing('cache'),
    ]);

    await tester.test();

    expect(tester.started()).toBe(true);
    expect(tester.healthy()).toBe(false);
    expect(onlyLine().level).toBe('warn');
    expect(onlyLine().message).toMatch(
      /^Health test failed: database failed after \d+ ms \(connection refused\), cache \d+ ms$/,
    );
  });

  it('reads a check that throws before it returns a promise as failed', async () => {
    const tester = new HealthTester([
      {
        name: 'database',
        test: () => {
          throw new Error('no connection string');
        },
      },
    ]);

    await tester.test();

    expect(tester.healthy()).toBe(false);
    expect(onlyLine().message).toMatch(
      /^Health test failed: database failed after \d+ ms \(no connection string\)$/,
    );
  });

  it('reads a rejection that is not an Error by its text', async () => {
    const tester = new HealthTester([
      { name: 'database', test: () => Promise.reject('timeout') },
    ]);

    await tester.test();

    expect(onlyLine().message).toMatch(
      /^Health test failed: database failed after \d+ ms \(timeout\)$/,
    );
  });

  it('names a failure with no message by its kind', async () => {
    const tester = new HealthTester([
      { name: 'database', test: () => Promise.reject(new TypeError()) },
    ]);

    await tester.test();

    expect(onlyLine().message).toMatch(
      /^Health test failed: database failed after \d+ ms \(TypeError\)$/,
    );
  });

  it('fails a check that does not answer within 10 seconds', async () => {
    jest.useFakeTimers();
    const tester = new HealthTester([
      { name: 'database', test: () => new Promise(() => undefined) },
    ]);

    const testing = tester.test();
    await jest.advanceTimersByTimeAsync(CHECK_TIME_LIMIT_MS);
    await testing;

    expect(tester.healthy()).toBe(false);
    expect(onlyLine().message).toBe(
      'Health test failed: database failed after 10000 ms (did not answer within 10000 ms)',
    );
  });

  it('is healthy again once its checks pass', async () => {
    let databaseUp = false;
    const tester = new HealthTester([
      {
        name: 'database',
        test: () =>
          databaseUp
            ? Promise.resolve()
            : Promise.reject(new Error('connection refused')),
      },
    ]);

    await tester.test();
    expect(tester.healthy()).toBe(false);

    databaseUp = true;
    await tester.test();
    expect(tester.healthy()).toBe(true);
  });

  it('tests as the app starts, then once a minute until the app stops', async () => {
    jest.useFakeTimers();
    const test = jest.fn(() => Promise.resolve());
    const tester = new HealthTester([{ name: 'database', test }]);

    tester.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(0);
    expect(test).toHaveBeenCalledTimes(1);
    expect(tester.healthy()).toBe(true);

    await jest.advanceTimersByTimeAsync(TEST_INTERVAL_MS);
    expect(test).toHaveBeenCalledTimes(2);

    tester.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(TEST_INTERVAL_MS * 2);
    expect(test).toHaveBeenCalledTimes(2);
  });

  // The chart's Kubernetes checks count failed tests by these, so a change must fail a test.
  it('tests once a minute and gives a check 10 seconds', () => {
    expect(TEST_INTERVAL_MS).toBe(60_000);
    expect(CHECK_TIME_LIMIT_MS).toBe(10_000);
  });
});
