import { ConfigService } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';
import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  async function build(
    configValues: Record<string, unknown>,
  ): Promise<HealthController> {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [TerminusModule],
      controllers: [HealthController],
      providers: [
        {
          provide: ConfigService,
          useValue: { get: (key: string) => configValues[key] },
        },
      ],
    }).compile();
    return moduleRef.get<HealthController>(HealthController);
  }

  afterEach(() => {
    delete process.env.ContainerMode;
  });

  it('startup returns ok', async () => {
    const controller = await build({ APP_ENV: 'staging', secretsLoaded: [] });
    const result = await controller.startup();
    expect(result.status).toBe('ok');
  });

  it('live returns ok', async () => {
    const controller = await build({ APP_ENV: 'staging', secretsLoaded: [] });
    const result = await controller.live();
    expect(result.status).toBe('ok');
  });

  it('ready is up when config loaded (non-container mode)', async () => {
    const controller = await build({ APP_ENV: 'staging', secretsLoaded: [] });
    const result = await controller.ready();
    expect(result.status).toBe('ok');
  });

  it('ready is 503/error in container mode when no secret was mounted', async () => {
    process.env.ContainerMode = 'true';
    const controller = await build({ APP_ENV: 'staging', secretsLoaded: [] });
    await expect(controller.ready()).rejects.toBeDefined();
  });
});
