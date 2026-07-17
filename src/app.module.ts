import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import configuration from './config/configuration';
import { validationOptions, validationSchema } from './config/validation';
import { buildLoggerOptions } from './logging/logger-options';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import { HelloModule } from './hello/hello.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      validationSchema,
      validationOptions,
    }),
    // Structured logging (Serilog parity): pino fan-out to console + daily files;
    // App Insights export rides the OTel pino bridge (telemetry/instrument.ts).
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        buildLoggerOptions({
          level: config.get<string>('logLevel', 'info'),
          serviceName: config.get<string>('appName', 'nestjs-api'),
          serviceVersion: config.get<string>('appVersion', '1.0.0'),
          environment: config.get<string>('APP_ENV', 'development'),
          fileEnabled: config.get<boolean>('logFileEnabled', true),
          fileDirectory: config.get<string>('logFileDirectory', 'logs'),
          retentionDays: config.get<number>('logRetentionDays', 31),
        }),
    }),
    HealthModule,
    HelloModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
