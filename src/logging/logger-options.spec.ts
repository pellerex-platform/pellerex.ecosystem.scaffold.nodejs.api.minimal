import { createServer, request } from 'http';
import type { AddressInfo } from 'net';
import type { DestinationStream } from 'pino';
import pinoHttp, { Options } from 'pino-http';
import { buildLoggerOptions, takeOrMakeCorrelationId } from './logger-options';

// Written out on purpose: the platform's proxy sends the header and the portal's
// Logs tab reads the log field by these exact names, so a rename must fail a test.
const HEADER = 'x-correlation-id';
const LOG_FIELD = 'CorrelationId';

const NEW_ID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

describe('takeOrMakeCorrelationId', () => {
  it('takes an id of letters, digits, hyphens, underscores and dots as sent', () => {
    // One of every kind of character an id may hold, with both ends of each range
    const sent = 'azAZ09-_.Order-42';

    expect(takeOrMakeCorrelationId(sent)).toBe(sent);
  });

  it('takes an id of 128 characters as sent', () => {
    const sent = 'a'.repeat(128);

    expect(takeOrMakeCorrelationId(sent)).toBe(sent);
  });

  it('takes the first id when the header arrives as a list', () => {
    expect(takeOrMakeCorrelationId(['order-42', 'order-43'])).toBe('order-42');
  });

  it('makes a new id for a call that sends none', () => {
    expect(takeOrMakeCorrelationId(undefined)).toMatch(NEW_ID);
  });

  it.each([
    '',
    ' ',
    'a'.repeat(129),
    'abc def',
    'abc,abc',
    'abc, abc',
    'abc\ndef',
    'abc\n',
    'abcïdef',
    '<script>',
    // The characters just outside each range an id may hold
    'abc/def',
    'abc:def',
    'abc@def',
    'abc[def',
    'abc`def',
    'abc{def',
  ])('replaces an id that is not safe to log: %j', (sent) => {
    expect(takeOrMakeCorrelationId(sent)).toMatch(NEW_ID);
  });
});

describe('the request logger', () => {
  type Line = Record<string, unknown>;

  /**
   * Serves one request through pino-http built from the template's own options,
   * the way nestjs-pino builds it, and returns the id on the reply with every
   * line the request wrote. The handler writes one line of its own.
   */
  async function serve(
    sent?: string,
    idAlreadyOnTheRequest?: string,
  ): Promise<{
    onReply: string | undefined;
    written: string[];
    lines: Line[];
  }> {
    const written: string[] = [];
    const [options] = buildLoggerOptions({
      level: 'info',
      serviceName: 'api',
      serviceVersion: '1.0.0',
      environment: 'development',
      fileEnabled: false,
      fileDirectory: '',
      retentionDays: 1,
    }).pinoHttp as [Options, DestinationStream];
    const logRequest = pinoHttp(options, {
      write: (line: string) => written.push(line),
    });

    const server = createServer((req, res) => {
      if (idAlreadyOnTheRequest !== undefined) {
        req.id = idAlreadyOnTheRequest;
      }
      logRequest(req, res);
      req.log.info('working');
      res.end('ok');
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const { port } = server.address() as AddressInfo;

    const onReply = await new Promise<string | undefined>((resolve, reject) => {
      request(
        {
          host: '127.0.0.1',
          port,
          path: '/v1/hello?page=2',
          agent: false,
          headers: sent === undefined ? {} : { [HEADER]: sent },
        },
        (response) => {
          response.resume();
          response.on('end', () =>
            resolve(response.headers[HEADER] as string | undefined),
          );
        },
      )
        .on('error', reject)
        .end();
    });
    await new Promise((resolve) => server.close(resolve));

    return {
      onReply,
      written,
      lines: written.map((line) => JSON.parse(line) as Line),
    };
  }

  const lineOfTheHandler = (lines: Line[]): Line =>
    lines.find((line) => line.msg === 'working') as Line;
  const completionLine = (lines: Line[]): Line =>
    lines.find((line) => String(line.msg).startsWith('HTTP GET ')) as Line;

  it("returns the caller's id and puts it on every line the request writes", async () => {
    const { onReply, lines } = await serve('Order-42');

    expect(onReply).toBe('Order-42');
    expect(lineOfTheHandler(lines)[LOG_FIELD]).toBe('Order-42');
    expect(completionLine(lines)[LOG_FIELD]).toBe('Order-42');
  });

  it('gives a call without an id a new one, on the reply and on every line', async () => {
    const { onReply, lines } = await serve();

    expect(onReply).toMatch(NEW_ID);
    expect(lineOfTheHandler(lines)[LOG_FIELD]).toBe(onReply);
    expect(completionLine(lines)[LOG_FIELD]).toBe(onReply);
  });

  it('replaces an id that is not safe to log, on the reply and on every line', async () => {
    const { onReply, lines } = await serve('abc def');

    expect(onReply).toMatch(NEW_ID);
    expect(lineOfTheHandler(lines)[LOG_FIELD]).toBe(onReply);
    expect(completionLine(lines)[LOG_FIELD]).toBe(onReply);
  });

  it('logs under the id the request already has, as it does under Fastify', async () => {
    const { lines } = await serve(undefined, 'given-by-the-adapter');

    expect(lineOfTheHandler(lines)[LOG_FIELD]).toBe('given-by-the-adapter');
    expect(completionLine(lines)[LOG_FIELD]).toBe('given-by-the-adapter');
  });

  it('writes the id once on the completion line, beside what the request ended with', async () => {
    const { written, lines } = await serve('Order-42');
    const completion = written.find((line) =>
      line.includes('"HTTP GET '),
    ) as string;

    expect(completion.split(`"${LOG_FIELD}"`)).toHaveLength(2);
    expect(completionLine(lines)).toMatchObject({
      StatusCode: 200,
      RequestMethod: 'GET',
      RequestPath: '/v1/hello',
      Environment: 'development',
    });
  });

  it('binds nothing but the id before the request has ended', async () => {
    const { lines } = await serve('Order-42');

    expect(lineOfTheHandler(lines)).not.toHaveProperty('StatusCode');
    expect(lineOfTheHandler(lines)).not.toHaveProperty('RequestPath');
  });
});
