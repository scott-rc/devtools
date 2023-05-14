import { deepMerge, PartialDeep, postgres, retry, stdColors } from "./deps.ts";
import { $, PartialCommandOptions } from "./command.ts";
import { defaults } from "./utils.ts";
import { dataRoot, logRoot, Path } from "./path.ts";

interface PostgresOptions<T extends Record<string, postgres.PostgresType>> extends postgres.Options<T> {
  data: Path;
}

export class Postgres<T extends Record<string, postgres.PostgresType> = Record<string, postgres.PostgresType>> {
  options;
  sql;
  parsedOptions;

  constructor(options: PartialDeep<PostgresOptions<T>> = {}) {
    this.options = defaults<PostgresOptions<T>>(options, {
      user: "postgres",
      password: "password",
      host: "127.0.0.1",
      port: 5432,
      data: dataRoot.join("postgres"),
    });

    this.sql = postgres(this.options);
    this.parsedOptions = this.sql.options;
  }

  clone(options: PartialDeep<PostgresOptions<T>>): Postgres<T> {
    // deno-lint-ignore no-explicit-any
    return new Postgres(deepMerge(this.options as any, options));
  }

  async start(options: PartialCommandOptions = {}): Promise<void> {
    options = defaults(options, {
      name: "postgres",
      color: stdColors.blue,
      logFile: logRoot.join(`${options.name ?? "postgres"}.log`),
      startupProbe: () => retry(() => this.sql`SELECT 1`, { maxTimeout: 1000 }),
      killSignal: "SIGINT", // postgres takes a long time to shutdown when sent SIGTERM
      env: {
        PGUSER: this.parsedOptions.user,
        PGPASSWORD: String(this.parsedOptions.pass),
        PGHOST: String(this.parsedOptions.host),
        PGPORT: String(this.parsedOptions.port),
        PGDATA: String(this.options.data),
      },
    });

    if (!await this.options.data.exists()) {
      await $`initdb --username=${this.parsedOptions.user} --encoding=UTF8`
        .withOptions(options);
    }

    await $`postgres -c unix_socket_directories= -c fsync=off -c full_page_writes=off`
      .withOptions(options)
      .spawn()
      .waitForStartupProbe();
  }

  async ensureDatabase(name: string): Promise<void> {
    if ((await this.sql`SELECT 1 FROM pg_database WHERE datname = ${name}`).length) {
      return;
    }
    await this.sql`CREATE DATABASE ${this.sql(name)}`;
  }
}
