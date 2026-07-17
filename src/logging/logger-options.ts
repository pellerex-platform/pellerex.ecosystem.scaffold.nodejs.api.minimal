import { randomUUID } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';
import { hostname } from 'os';
import * as pino from 'pino';
import type { Params } from 'nestjs-pino';
import { DailyRotatingFileStream } from './daily-rotating-file-stream';

const MACHINE_NAME = hostname();

/** Header used to propagate/echo the per-request correlation id (matches the
 * .NET LogContextEnrichment CorrelationId and the Go scaffold's middleware). */
export const CORRELATION_ID_HEADER = 'x-correlation-id';

/** Subset of AppConfig the logger needs (mirrors the Go LogConfig). */
export interface LoggerSettings {
  level: string;
  serviceName: string;
  serviceVersion: string;
  environment: string;
  fileEnabled: boolean;
  fileDirectory: string;
  retentionDays: number;
}

/**
 * Builds the `nestjs-pino` options — the Serilog-equivalent sink fan-out:
 *
 * 1. Console — JSON to stdout (always; collected by the platform).
 * 2. Files — daily-rolling `log-<date>.log` (text) + `log-<date>.json` (JSON)
 *    under `fileDirectory`, pruned after `retentionDays` (Serilog File sinks).
 * 3. Azure Application Insights — every record is ALSO exported via the
 *    OpenTelemetry logs bridge (`@opentelemetry/instrumentation-pino`, wired in
 *    `telemetry/instrument.ts`), which hooks pino itself — no extra stream here.
 *
 * Every record carries the standing enrichers (`service.name`,
 * `service.version`, `deployment.environment`); every HTTP request is logged
 * with a generated/propagated correlation id that is echoed on the response.
 */
export function buildLoggerOptions(settings: LoggerSettings): Params {
  const streams: pino.StreamEntry[] = [
    { level: settings.level as pino.Level, stream: process.stdout },
  ];

  if (settings.fileEnabled && settings.fileDirectory) {
    // JSON file (.NET Logs/log-<date>.json) — machine-queryable.
    streams.push({
      level: settings.level as pino.Level,
      stream: new DailyRotatingFileStream(
        settings.fileDirectory,
        'log-',
        '.json',
        settings.retentionDays,
      ),
    });
    // Text file (.NET Logs/log-<date>.log) — human-readable.
    streams.push({
      level: settings.level as pino.Level,
      stream: new DailyRotatingFileStream(
        settings.fileDirectory,
        'log-',
        '.log',
        settings.retentionDays,
        formatTextLine,
      ),
    });
  }

  return {
    pinoHttp: [
      {
        level: settings.level,
        // Standing enrichers on every record (Serilog Enrich equivalent).
        base: {
          'service.name': settings.serviceName,
          'service.version': settings.serviceVersion,
          'deployment.environment': settings.environment,
        },
        // Correlation id: honour the inbound header or generate one, and echo
        // it on the response. pino-http logs it as `req.id` on every record
        // produced within the request context.
        genReqId: (req: IncomingMessage, res: ServerResponse) => {
          const header = req.headers[CORRELATION_ID_HEADER];
          const id =
            (Array.isArray(header) ? header[0] : header) || randomUUID();
          res.setHeader('X-Correlation-Id', id);
          return id;
        },
        autoLogging: true,
        // The flat attribute names below are a CONTRACT with the Pellerex
        // portal's Logs tab: its KQL reads customDimensions.RequestMethod /
        // RequestPath / StatusCode / Elapsed / CorrelationId / Environment /
        // UserAgent / ClientIPAddress / ClientPort / Port / MachineName by
        // exact name (they must be TOP-LEVEL, not nested under req/res, for
        // the OTel pino bridge to export them as individual dimensions).
        // Renaming any of them blanks the matching column in the portal.
        customAttributeKeys: { responseTime: 'Elapsed' },
        customSuccessMessage: (
          req: IncomingMessage,
          res: ServerResponse,
          responseTime: number,
        ) =>
          `HTTP ${req.method ?? ''} ${(req.url ?? '').split('?')[0]} responded ${res.statusCode} in ${responseTime} ms`,
        customErrorMessage: (req: IncomingMessage, res: ServerResponse) =>
          `HTTP ${req.method ?? ''} ${(req.url ?? '').split('?')[0]} errored with ${res.statusCode}`,
        // pino-http evaluates customProps TWICE: at request start (child-logger
        // bindings — URL/status/correlation aren't final yet) and again at
        // response-finish. Binding both times duplicates every key in the
        // completion line with stale values first, so only bind once the
        // response has actually ended.
        customProps: (req: IncomingMessage, res: ServerResponse) => {
          if (!res.writableEnded) {
            return {};
          }
          const forwarded = req.headers['x-forwarded-for'];
          const clientIp =
            (Array.isArray(forwarded) ? forwarded[0] : forwarded)
              ?.split(',')[0]
              ?.trim() ||
            req.socket?.remoteAddress ||
            '';
          return {
            StatusCode: res.statusCode,
            RequestMethod: req.method ?? '',
            RequestPath: (req.url ?? '').split('?')[0],
            CorrelationId: String(res.getHeader('x-correlation-id') ?? ''),
            Environment: settings.environment,
            UserAgent: req.headers['user-agent'] ?? '',
            ClientIPAddress: clientIp,
            ClientPort: String(req.socket?.remotePort ?? ''),
            Port: String(req.socket?.localPort ?? ''),
            MachineName: MACHINE_NAME,
          };
        },
      },
      pino.multistream(streams),
    ],
  };
}

/** pino numeric level → label (for the human-readable .log file). */
const LEVEL_LABELS: Record<number, string> = {
  10: 'TRACE',
  20: 'DEBUG',
  30: 'INFO',
  40: 'WARN',
  50: 'ERROR',
  60: 'FATAL',
};

/**
 * Turns a serialised pino JSON line into the text-file shape
 * (`<iso-time> [LEVEL] <msg> {extra}`), mirroring the .NET text sink's
 * `{Timestamp:G} {Message}` output template.
 */
export function formatTextLine(jsonLine: string): string {
  try {
    const record = JSON.parse(jsonLine) as Record<string, unknown>;
    const {
      level,
      time,
      msg,
      // standing enrichers + noise excluded from the text tail for readability
      'service.name': _svc,
      'service.version': _ver,
      'deployment.environment': _env,
      pid: _pid,
      hostname: _host,
      ...rest
    } = record;
    const ts = new Date(time as number).toISOString();
    const label = LEVEL_LABELS[level as number] ?? String(level);
    const tail = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest)}` : '';
    return `${ts} [${label}] ${String(msg ?? '')}${tail}\n`;
  } catch {
    return jsonLine;
  }
}
