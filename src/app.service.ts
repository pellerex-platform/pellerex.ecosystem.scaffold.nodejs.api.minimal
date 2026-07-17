import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppService {
  constructor(private readonly config: ConfigService) {}

  getInfo(): { name: string; environment: string; status: string } {
    return {
      name: this.config.get<string>('appName') ?? 'nestjs-api',
      environment: this.config.get<string>('APP_ENV') ?? 'development',
      status: 'ok',
    };
  }
}
