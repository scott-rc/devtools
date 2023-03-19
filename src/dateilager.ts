import { colors, outdent, PathRef, retry } from "./deps.ts";
import { dataRoot, logRoot } from "./path.ts";
import { Postgres } from "./postgres.ts";
import { $, CommandOptions } from "./command.ts";
import { defaults } from "./utils.ts";

export interface DateiLagerOptions {
  adminToken: string;
  host: string;
  port: number;
  data: PathRef;
  migrations: PathRef;
  cert: PathRef;
  key: PathRef;
  paseto: PathRef;
}

export class DateiLager {
  options: DateiLagerOptions;

  get databaseUrl(): string {
    const sslmode = typeof this.pg.parsedOptions.ssl === "boolean"
      ? this.pg.parsedOptions.ssl ? "require" : "disable"
      : this.pg.parsedOptions.ssl;

    return `postgres://${this.pg.parsedOptions.user}:${this.pg.parsedOptions.pass}@${this.pg.parsedOptions.host}:${this.pg.parsedOptions.port}/${this.pg.parsedOptions.database}?sslmode=${sslmode}`;
  }

  constructor(public pg: Postgres, options: Partial<DateiLagerOptions> = {}) {
    const data = options?.data ?? dataRoot.join("dateilager");

    this.options = defaults<DateiLagerOptions>(options, {
      host: "127.0.0.1",
      port: 5051,
      data,
      migrations: data.join("migrations"),
      paseto: data.join("paseto.pub"),
      cert: data.join("server.crt"),
      key: data.join("server.key"),
      // deno-fmt-ignore cspell: disable
      adminToken: "v2.public.eyJzdWIiOiJhZG1pbiIsImlhdCI6IjIwMjEtMTAtMTVUMTE6MjA6MDAuMDM0WiJ9WtEey8KfQQRy21xoHq1C5KQatEevk8RxS47k4bRfMwVCPHumZmVuk6ADcfDHTmSnMtEGfFXdxnYOhRP6Clb_Dw",
    });
  }

  async start(options: Partial<CommandOptions> = {}): Promise<void> {
    options = defaults(options, {
      name: "dateilager",
      color: colors.magenta,
      logFile: logRoot.join(`${options.name ?? "dateilager"}.log`),
      startupProbe: () => retry(() => $`nc -z ${this.options.host} ${this.options.port}`.quiet(), { maxTimeout: 1000 }),
      env: {
        DL_ENV: "dev",
      },
    });

    await $`migrate -path "$DL_MIGRATION_DIR" -database "${this.databaseUrl}" up`.withOptions(options);

    const projects = await this.pg.sql`SELECT 1 FROM dl.projects WHERE id = 1`;
    if (!projects.length) {
      await this.pg
        .sql`INSERT INTO dl.projects (id, latest_version, pack_patterns) VALUES (1, 0, '{"^node_modules/.*/"}')`;
    }

    if (!await this.options.cert.exists() || !await this.options.key.exists()) {
      await this.options.data.mkdir();
      await $`mkcert -cert-file ${this.options.cert} -key-file ${this.options.key} localhost 127.0.0.1 ::1`
        .withOptions(options);
    }

    if (!await this.options.paseto.exists()) {
      await this.options.paseto.writeText(
        outdent`-----BEGIN PUBLIC KEY-----
              MCowBQYDK2VwAyEASKQkA/AxlNCdOHTnp5McesmQ+y756VTtGz8Xrt1G0fs=
              -----END PUBLIC KEY-----`,
      );
    }

    await $`dateilager-server --port=${this.options.port} --dburi="${this.databaseUrl}" --cert=${this.options.cert} --key=${this.options.key} --paseto=${this.options.paseto}`
      .withOptions(options)
      .spawn()
      .waitForStartupProbe();
  }
}
