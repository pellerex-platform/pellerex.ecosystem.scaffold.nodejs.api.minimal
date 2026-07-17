import * as fs from 'fs';
import * as path from 'path';

/**
 * Daily-rolling file sink — the Node analogue of the .NET Serilog File sink
 * (`Logs/log-<date>.log` / `.json`, rollingInterval: Day). Appends each pino
 * line to `<dir>/<prefix><YYYYMMDD><suffix>`, rolls to a new file at the date
 * change, and prunes files older than `retentionDays` (same semantics as the
 * Go scaffold's dailyFileWriter). Used as a `pino.multistream` destination.
 *
 * An optional `formatLine` turns the serialised pino JSON line into another
 * shape (the text `.log` variant); when omitted the JSON line is written as-is.
 */
export class DailyRotatingFileStream {
  private day = '';
  private stream: fs.WriteStream | null = null;

  constructor(
    private readonly dir: string,
    private readonly prefix: string,
    private readonly suffix: string,
    private readonly retentionDays: number,
    private readonly formatLine?: (jsonLine: string) => string,
  ) {
    fs.mkdirSync(dir, { recursive: true });
    this.rotate(today());
  }

  /** pino.multistream calls this with one serialised log line per record. */
  write(line: string): void {
    const d = today();
    if (d !== this.day) {
      this.rotate(d);
    }
    this.stream?.write(this.formatLine ? this.formatLine(line) : line);
  }

  /** Flush and close the underlying file (called on shutdown). */
  end(): void {
    this.stream?.end();
    this.stream = null;
  }

  private rotate(d: string): void {
    this.stream?.end();
    this.day = d;
    this.stream = fs.createWriteStream(
      path.join(this.dir, `${this.prefix}${d}${this.suffix}`),
      { flags: 'a' },
    );
    this.prune();
  }

  /** Best-effort removal of matching log files older than retentionDays. */
  private prune(): void {
    if (this.retentionDays <= 0) {
      return;
    }
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.retentionDays);
    const cutoffKey = formatDay(cutoff);
    let entries: string[];
    try {
      entries = fs.readdirSync(this.dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (!name.startsWith(this.prefix) || !name.endsWith(this.suffix)) {
        continue;
      }
      const datePart = name.slice(this.prefix.length, name.length - this.suffix.length);
      if (!/^\d{8}$/.test(datePart) || datePart >= cutoffKey) {
        continue;
      }
      try {
        fs.unlinkSync(path.join(this.dir, name));
      } catch {
        // best-effort
      }
    }
  }
}

/** YYYYMMDD for the current date (matches the .NET/Go daily file naming). */
function today(): string {
  return formatDay(new Date());
}

function formatDay(d: Date): string {
  const y = d.getFullYear().toString().padStart(4, '0');
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}${m}${day}`;
}
