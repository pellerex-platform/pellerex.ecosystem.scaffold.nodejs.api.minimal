// Telemetry must be initialised before anything else loads (NODE-D7).
import './telemetry/instrument';

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import helmet from '@fastify/helmet';
import { Logger as PinoLogger } from 'nestjs-pino';
import { randomUUID } from 'crypto';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { CORRELATION_ID_HEADER } from './logging/logger-options';

/**
 * Container port — hardcoded to the platform contract (NODE-D5). NOT the
 * `<port-number>` token (which resolves to 9000). Dockerfile `EXPOSE 8890`, Helm
 * `Service.targetPort: 8890` and the deployment `containerPort: 8890` all match.
 */
const PORT = 8890;

async function bootstrap(): Promise<void> {
  // NODE-D20 — NestJS on the Fastify adapter (~2x Express throughput).
  // bufferLogs: hold early framework logs until the pino logger takes over, so
  // every line (including bootstrap) flows through the structured sinks.
  //
  // Correlation id (the .NET LogContextEnrichment equivalent): Fastify assigns
  // the request id BEFORE any middleware, so it — not pino-http — must derive it
  // from the inbound X-Correlation-Id header (or mint a UUID). pino-http then
  // reuses it as `req.id` on every log record for the request.
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      genReqId: (req: { headers: Record<string, string | string[] | undefined> }) => {
        const header = req.headers[CORRELATION_ID_HEADER];
        return (Array.isArray(header) ? header[0] : header) || randomUUID();
      },
    }),
    { bufferLogs: true },
  );

  // Route ALL Nest logging (framework + Logger.log everywhere) through pino —
  // console + daily files + App Insights (Serilog parity, NODE logging).
  app.useLogger(app.get(PinoLogger));

  // Echo the correlation id on every response so callers can stitch logs.
  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onRequest', (req, reply, done) => {
      void reply.header('X-Correlation-Id', req.id);
      done();
    });

  // NODE-D22 — Helmet security headers (Fastify plugin).
  await app.register(helmet);

  // NODE-D22 — global input validation: reject unexpected/malformed input everywhere.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // NODE-D22 — global exception filter (structured envelope, no stack traces in prod).
  app.useGlobalFilters(new AllExceptionsFilter());

  // NODE-D13 — drain in-flight work on SIGTERM during AKS rolling updates.
  app.enableShutdownHooks();

  await app.listen(PORT, '0.0.0.0');
  Logger.log(`NestJS managed-API listening on 0.0.0.0:${PORT}`, 'Bootstrap');
}

void bootstrap();
