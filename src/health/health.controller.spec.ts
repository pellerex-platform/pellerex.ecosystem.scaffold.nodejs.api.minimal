import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthTester } from './health-tester';

describe('HealthController', () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  /**
   * Serves the three health addresses on Fastify, from a tester that reports the
   * given state, and returns what each answered as "<status> <content type> <body>".
   */
  async function answers(state: {
    started: boolean;
    healthy: boolean;
  }): Promise<Record<string, string>> {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthTester,
          useValue: {
            started: () => state.started,
            healthy: () => state.healthy,
          },
        },
      ],
    }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const answered: Record<string, string> = {};
    for (const path of ['/health/startup', '/health/live', '/health/ready']) {
      const response = await app.inject({
        method: 'GET',
        url: path,
        headers: { accept: 'application/json' },
      });
      answered[path] =
        `${response.statusCode} ${String(response.headers['content-type'])} ${response.body}`;
    }
    return answered;
  }

  it('answers Unhealthy at every address before the first test', async () => {
    expect(await answers({ started: false, healthy: false })).toEqual({
      '/health/startup': '503 text/plain; charset=utf-8 Unhealthy',
      '/health/live': '503 text/plain; charset=utf-8 Unhealthy',
      '/health/ready': '503 text/plain; charset=utf-8 Unhealthy',
    });
  });

  it('answers Healthy at every address after a passed test', async () => {
    expect(await answers({ started: true, healthy: true })).toEqual({
      '/health/startup': '200 text/plain; charset=utf-8 Healthy',
      '/health/live': '200 text/plain; charset=utf-8 Healthy',
      '/health/ready': '200 text/plain; charset=utf-8 Healthy',
    });
  });

  // A failed test keeps the app started, so Kubernetes does not kill it while it
  // starts, and the answer is one word with no reason: anyone can call it.
  it('answers Unhealthy at live and ready after a failed test, with no reason', async () => {
    expect(await answers({ started: true, healthy: false })).toEqual({
      '/health/startup': '200 text/plain; charset=utf-8 Healthy',
      '/health/live': '503 text/plain; charset=utf-8 Unhealthy',
      '/health/ready': '503 text/plain; charset=utf-8 Unhealthy',
    });
  });
});
