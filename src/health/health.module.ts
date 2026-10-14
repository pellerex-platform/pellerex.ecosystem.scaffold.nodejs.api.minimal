import { Module } from '@nestjs/common';
import { HEALTH_CHECKS } from './health-check';
import { HealthController } from './health.controller';
import { HealthTester } from './health-tester';

@Module({
  controllers: [HealthController],
  providers: [
    HealthTester,
    // What the app cannot work without, tested once a minute. A new app has
    // nothing to test. When it gains something, provide its checks here
    // instead, for example its database:
    //   { provide: HEALTH_CHECKS, inject: [DataSource], useFactory: (dataSource: DataSource) =>
    //       [{ name: 'database', test: () => dataSource.query('SELECT 1') }] }
    { provide: HEALTH_CHECKS, useValue: [] },
  ],
})
export class HealthModule {}
