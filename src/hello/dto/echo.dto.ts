import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * NODE-D22 — class-validator DTO. The global `ValidationPipe`
 * (`whitelist` + `forbidNonWhitelisted` + `transform`) rejects any request body
 * that is malformed or carries unexpected properties.
 */
export class EchoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  message: string;
}
