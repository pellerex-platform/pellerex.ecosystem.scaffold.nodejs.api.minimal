import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
  HealthIndicatorResult,
} from '@nestjs/terminus';

/**
 * NODE-D12 — health endpoints served at ROOT (`/health/{startup,live,ready}`),
 * no `/api` prefix, matching the .NET contract and the proxy's auth-bypass list.
 * No Kubernetes probes are configured (the reference defines none).
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly config: ConfigService,
  ) {}

  @Get('startup')
  @HealthCheck()
  startup(): Promise<HealthCheckResult> {
    return this.health.check([]);
  }

  @Get('live')
  @HealthCheck()
  live(): Promise<HealthCheckResult> {
    return this.health.check([]);
  }

  @Get('ready')
  @HealthCheck()
  ready(): Promise<HealthCheckResult> {
    return this.health.check([() => this.checkConfig()]);
  }

  /**
   * Readiness gate: config must have loaded, and — in container mode — at least one
   * Key Vault secret must have been read from the CSI tmpfs mount (NODE-D6). A
   * `down` status makes terminus return 503 automatically. No secret values are
   * exposed, only the count.
   */
  private async checkConfig(): Promise<HealthIndicatorResult> {
    const appEnv = this.config.get<string>('APP_ENV');
    const secretsLoaded = this.config.get<string[]>('secretsLoaded') ?? [];
    const containerMode = process.env.ContainerMode === 'true';

    const isUp = Boolean(appEnv) && (!containerMode || secretsLoaded.length > 0);

    return {
      config: {
        status: isUp ? 'up' : 'down',
        appEnv: appEnv ?? null,
        secretsLoaded: secretsLoaded.length,
      },
    };
  }
}
