import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class HelloService {
  constructor(private readonly config: ConfigService) {}

  greeting(): { message: string } {
    return { message: 'Hello from the Pellerex NestJS managed-API scaffold' };
  }

  echo(message: string): { message: string } {
    return { message };
  }

  /**
   * Proves the Key Vault secret was read from the CSI tmpfs file mount (NODE-D6)
   * WITHOUT leaking its value — returns only whether it is present.
   */
  secretStatus(): { dbConnectionStringLoaded: boolean; secretsLoaded: string[] } {
    const dbConnectionString = this.config.get<string>('dbConnectionString') ?? '';
    return {
      dbConnectionStringLoaded: dbConnectionString.length > 0,
      secretsLoaded: this.config.get<string[]>('secretsLoaded') ?? [],
    };
  }
}
