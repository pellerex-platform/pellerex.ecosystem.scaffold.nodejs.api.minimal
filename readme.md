# NestJS Managed-API Scaffold (Pellerex)

A production-ready **NestJS** backend-API scaffold for the Pellerex managed-API
platform — the Node.js peer of `dotnet.api.scaffold.minimal`. It satisfies the same
platform contract (tokeniser, port 8890, root health paths, Helm topology, CSI Key
Vault, DockerHub, ProxyApi) so the generic provisioning chain runs against it with no
special-casing.

Tokens such as `RepoUniqueNormalisedIdentifier`, `RepoUniqueIdentifier`,
`<*-namespace>`, `<*-keyvault-name>`, `<azure-app-insights-connection-string-in-{env}>`
and `<secret-provider-class-enabled>` are substituted by the platform
`TemplateTokeniser` at `InstallRepoTemplate`.

## Key decisions baked in

| Area | Choice | Decision |
|---|---|---|
| HTTP adapter | **Fastify** (`@nestjs/platform-fastify`) | NODE-D20 |
| Port | **8890** hardcoded everywhere (not the `<port-number>` token → 9000) | NODE-D5 |
| Health | `@nestjs/terminus` at `/health/{startup,live,ready}` (root, no `/api`) | NODE-D12 |
| Config | `@nestjs/config` + `config.{env}.json`, validate-at-boot / fail-fast | NODE-D22 |
| Secrets | CSI **tmpfs file mount**, key-per-file → `@nestjs/config` (no `secretObjects`, no env vars, never in etcd) | NODE-D6 |
| Telemetry | `@azure/monitor-opentelemetry` (first-party) from the connection-string token | NODE-D7 |
| Logging | **pino** (`nestjs-pino`) fan-out: JSON console + daily-rolling files + App Insights via the OTel pino bridge; config-driven level; correlation id | NODE-D7 |
| Shutdown | `app.enableShutdownHooks()` (SIGTERM drain) | NODE-D13 |
| Node | pinned `node:22-alpine`, multi-stage, non-root (uid 1001), `npm ci --omit=dev` runtime | NODE-D15 / D21 |
| Hardening | Helm `securityContext`: read-only root FS, drop ALL caps, no-priv-esc, seccomp `RuntimeDefault`; `npm audit` CI gate | NODE-D21 |
| Safety | global `ValidationPipe` + class-validator DTOs, global exception filter (no stack traces in prod), Helmet, TS `strict` | NODE-D22 |

## Environment model

- `NODE_ENV` — Node runtime mode. **`production` in every deployed environment** (NODE-D14).
- `APP_ENV` — selects `config.{env}.json` (`development` | `staging` | `qualityassurance` | `production`). Kept separate from `NODE_ENV`.
- `ContainerMode=true` — enables reading secrets from the CSI mount (`SECRETS_MOUNT_PATH`, default `/mnt/secrets-store`).

**Local development.** `config.development.json` supplies non-secret config. Secret material lives in a local key-per-file directory — **`~/.pellerex/secrets/<product>/`** — that mirrors the prod CSI `/mnt/secrets-store` layout exactly (one file per secret). `./start/setup-secrets.sh` seeds it and `./start/run-local.sh` points the app at it via `SECRETS_MOUNT_PATH` (running in container mode so the read path matches prod). Same convention as every non-.NET Pellerex scaffold.

## Logging (Serilog parity)

Structured logging via **pino** (`nestjs-pino`), fanned out to three sinks like the .NET scaffold's Serilog:

1. **Console** — JSON to stdout (always; collected by the platform).
2. **Files** — daily-rolling `log-<date>.log` (text) + `log-<date>.json` (JSON) under
   `logging.file_directory`, pruned after `retention_days`. In-cluster the directory is a writable
   `emptyDir` (`/var/log/app`) mounted by the Helm chart (read-only root FS stays intact).
3. **Azure Application Insights** — `@opentelemetry/instrumentation-pino` bridges every record into
   the OTel logs pipeline that `useAzureMonitor` registers (first-party, in-process — no collector),
   with trace↔log correlation injected automatically.

Every record carries `service.name` / `service.version` / `deployment.environment`. Every request is
logged with a correlation id (inbound `X-Correlation-Id` honoured, otherwise a UUID; always echoed on
the response). Settings precedence: env var > `config.{env}.json` > default — `LOG_LEVEL`,
`LOG_FILE_ENABLED`, `LOG_FILE_DIRECTORY`, `LOG_RETENTION_DAYS` map to the `logging` block.

## Layout

```
src/
  main.ts                     Fastify bootstrap, Helmet, ValidationPipe, exception filter, shutdown hooks
  app.module.ts               ConfigModule (validate-at-boot) + LoggerModule (pino) + Health + Hello
  config/                     config.{env}.json loader + CSI key-per-file secret reader + Joi schema
  logging/                    pino sink fan-out: rotating file streams + logger options
  telemetry/instrument.ts     Azure Monitor OpenTelemetry init + pino→OTel logs bridge (imported first)
  common/filters/             global exception filter
  health/                     terminus controller — /health/{startup,live,ready}
  hello/                      sample endpoint + class-validator DTO + /v1/secret-status
infrastructure/
  Dockerfile is at repo root
  Helm/                       Deployment + Service(ClusterIP 80→8890) + Ingress + serviceaccount, per-env values
  secret-provider-class-{env}.yaml   CSI file mount, *-api-vault, no secretObjects
  azure-containers-pipelines.yml     npm ci → nest build → test → npm audit → docker build/push
```

## Develop

```bash
./start/setup-secrets.sh   # once: seed ~/.pellerex/secrets/<product>/ (key-per-file)
./start/run-local.sh       # http://localhost:8890 — reads secrets from the local mount (prod parity)

# or plain, without the local secret mount:
npm ci
npm run start:dev          # http://localhost:8890
npm test
npm run build              # -> dist/
```

Health: `GET /health/startup|live|ready`. Sample: `GET /v1/hello`, `POST /v1/echo`
`{ "message": "..." }`, `GET /v1/secret-status` (proves the Key Vault secret was
read from the tmpfs mount without exposing its value).
