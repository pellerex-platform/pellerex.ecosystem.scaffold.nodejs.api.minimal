import { Controller, Get, Module } from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { LoggerModule, Logger as PinoLogger } from 'nestjs-pino';
import type { Options } from 'pino-http';
import { HealthModule } from '../health/health.module';
import { buildLoggerOptions } from './logger-options';

@Controller('v1')
class SampleController {
  @Get('hello')
  hello(): string {
    return 'hello';
  }
}

/**
 * The request log as the app runs it: the template's logger options under
 * nestjs-pino, on Fastify, with the real health addresses. Fastify's middleware
 * layer hands the request logger a shortened address, which a plain HTTP server
 * does not, so this is where leaving the health addresses out is proven.
 */
describe('the request log under Nest and Fastify', () => {
  let app: NestFastifyApplication;
  const written: string[] = [];

  beforeAll(async () => {
    const [options] = buildLoggerOptions({
      level: 'info',
      serviceName: 'api',
      serviceVersion: '1.0.0',
      environment: 'development',
      fileEnabled: false,
      fileDirectory: '',
      retentionDays: 1,
    }).pinoHttp as [Options, unknown];

    @Module({
      imports: [
        LoggerModule.forRoot({
          pinoHttp: [options, { write: (line: string) => written.push(line) }],
        }),
        HealthModule,
      ],
      controllers: [SampleController],
    })
    class AppUnderTest {}

    const moduleRef = await Test.createTestingModule({
      imports: [AppUnderTest],
    }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
      { bufferLogs: true },
    );
    app.useLogger(app.get(PinoLogger));
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  /** Calls the address and returns the request lines written for it. */
  async function requestLinesOf(url: string): Promise<string[]> {
    written.length = 0;
    await app.inject({ method: 'GET', url });
    return written.filter((line) =>
      line.includes(`"msg":"HTTP GET ${url.split('?')[0]} `),
    );
  }

  it.each([
    '/health/startup',
    '/health/live',
    '/health/ready',
    '/health/ready?probe=1',
  ])('writes no request line for a call to %s', async (url) => {
    expect(await requestLinesOf(url)).toHaveLength(0);
    expect(written).toHaveLength(0);
  });

  it.each(['/v1/hello', '/health/readyz'])(
    'writes the request line of any other address: %s',
    async (url) => {
      expect(await requestLinesOf(url)).toHaveLength(1);
    },
  );
});
