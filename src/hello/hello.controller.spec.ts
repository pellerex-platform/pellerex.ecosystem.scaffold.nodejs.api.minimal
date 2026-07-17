import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { HelloController } from './hello.controller';
import { HelloService } from './hello.service';

describe('HelloController', () => {
  let controller: HelloController;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [HelloController],
      providers: [
        HelloService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'dbConnectionString') return 'Server=db;...';
              if (key === 'secretsLoaded') return ['DbConnectionString'];
              return undefined;
            },
          },
        },
      ],
    }).compile();

    controller = moduleRef.get<HelloController>(HelloController);
  });

  it('returns a greeting', () => {
    expect(controller.greeting().message).toContain('NestJS');
  });

  it('echoes the validated message', () => {
    expect(controller.echo({ message: 'ping' })).toEqual({ message: 'ping' });
  });

  it('reports the secret as loaded without leaking its value', () => {
    const status = controller.secretStatus();
    expect(status.dbConnectionStringLoaded).toBe(true);
    expect(status.secretsLoaded).toContain('DbConnectionString');
    expect(JSON.stringify(status)).not.toContain('Server=db');
  });
});
