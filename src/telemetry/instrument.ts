/**
 * NODE-D7 — first-party Azure Monitor OpenTelemetry. This module MUST be imported
 * before the NestJS/HTTP stack so the auto-instrumentation can patch the libraries
 * it loads. `main.ts` imports it on its very first line.
 *
 * The connection string comes from the tokenised
 * `<azure-app-insights-connection-string-in-{env}>` value in `config.{env}.json`
 * (or the `APPLICATIONINSIGHTS_CONNECTION_STRING` env var for local runs).
 */
import { useAzureMonitor } from '@azure/monitor-opentelemetry';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino';
import { isUnsubstitutedToken, loadConfigFile } from '../config/config-file';

function resolveConnectionString(): string {
  const fromEnv = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
  if (fromEnv) {
    return fromEnv;
  }
  const file = loadConfigFile();
  return file?.azure?.applicationInsights?.connectionString || '';
}

const connectionString = resolveConnectionString();

if (connectionString && !isUnsubstitutedToken(connectionString)) {
  useAzureMonitor({
    azureMonitorExporterOptions: { connectionString },
  });
  // Bridge pino → OpenTelemetry logs: every pino record is ALSO emitted to the
  // logs pipeline useAzureMonitor registered, so application logs land in App
  // Insights alongside traces/metrics (the Serilog ApplicationInsights sink
  // equivalent — first-party, in-process, no collector). The instrumentation
  // additionally injects trace_id/span_id into each pino line (log↔trace
  // correlation). Must be registered BEFORE nestjs-pino loads pino.
  registerInstrumentations({
    instrumentations: [new PinoInstrumentation()],
  });
  // eslint-disable-next-line no-console
  console.log(
    '[telemetry] Azure Monitor OpenTelemetry initialised (traces+metrics+logs)',
  );
} else {
  // eslint-disable-next-line no-console
  console.log(
    '[telemetry] no App Insights connection string configured — telemetry disabled',
  );
}
