import { Body, Controller, Get, Post } from '@nestjs/common';
import { EchoDto } from './dto/echo.dto';
import { HelloService } from './hello.service';

/**
 * Versioned sample API surface — `/v1/hello`, `/v1/echo`, `/v1/secret-status`.
 * The `/v1` prefix matches every other scaffold (.NET/Go/Python/Java); platform
 * conventions assume the sample surface lives under `/v1/`.
 */
@Controller('v1')
export class HelloController {
  constructor(private readonly helloService: HelloService) {}

  @Get('hello')
  greeting(): { message: string } {
    return this.helloService.greeting();
  }

  @Post('echo')
  echo(@Body() body: EchoDto): { message: string } {
    return this.helloService.echo(body.message);
  }

  @Get('secret-status')
  secretStatus(): { dbConnectionStringLoaded: boolean; secretsLoaded: string[] } {
    return this.helloService.secretStatus();
  }
}
