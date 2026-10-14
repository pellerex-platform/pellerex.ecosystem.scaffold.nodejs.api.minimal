import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { HealthTester } from './health-tester';

/**
 * NODE-D12 — health endpoints served at ROOT (`/health/{startup,live,ready}`),
 * no `/api` prefix, matching the .NET contract and the proxy's auth-bypass list.
 *
 * Each answers one word from the last result of the `HealthTester`: `Healthy`
 * (200) or `Unhealthy` (503). Anyone can call them, so what failed and why goes
 * to the health test's log line only. The words are ASP.NET Core's own, which the
 * .NET scaffold answers with, so an app answers the same in every language. The
 * chart's Kubernetes checks call them.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly healthTester: HealthTester) {}

  /** Healthy once the first health test has finished, whatever it found. */
  @Get('startup')
  startup(@Res({ passthrough: true }) reply: FastifyReply): string {
    return answer(reply, this.healthTester.started());
  }

  /** Healthy when the last health test passed. */
  @Get('live')
  live(@Res({ passthrough: true }) reply: FastifyReply): string {
    return answer(reply, this.healthTester.healthy());
  }

  /** Healthy when the last health test passed. */
  @Get('ready')
  ready(@Res({ passthrough: true }) reply: FastifyReply): string {
    return answer(reply, this.healthTester.healthy());
  }
}

function answer(reply: FastifyReply, healthy: boolean): string {
  void reply
    .status(healthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE)
    .type('text/plain; charset=utf-8');
  return healthy ? 'Healthy' : 'Unhealthy';
}
