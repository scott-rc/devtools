import { $, PartialCommandOptions } from "./command.ts";
import { colors, PathRef, retry } from "./deps.ts";
import { dataRoot, logRoot } from "./path.ts";
import { defaults } from "./utils.ts";

interface ToxiProxyOptions {
  host: string;
  port: number;
  logLevel: "panic" | "fatal" | "error" | "warn" | "info" | "debug" | "trace";
  config: PathRef | {
    name: string;
    listen: string;
    upstream: string;
    enabled: boolean;
  }[];
}

export class ToxiProxy {
  options: ToxiProxyOptions;

  constructor(options: Partial<ToxiProxyOptions> = {}) {
    this.options = defaults<ToxiProxyOptions>(options, {
      host: "127.0.0.1",
      port: 8474,
      logLevel: "warn",
      config: [],
    });
  }

  async start(options: PartialCommandOptions = {}): Promise<void> {
    options = defaults(options, {
      name: "toxiproxy",
      color: colors.yellow,
      logFile: logRoot.join(`${options.name ?? "toxiproxy"}.log`),
      startupProbe: () => retry(() => $`nc -z ${this.options.host} ${this.options.port}`.quiet(), { maxTimeout: 1000 }),
      expectedExitCodes: [0, 130], // toxiproxy-server exits with 130 when it receives SIGINT (Ctrl+C)
      env: {
        LOG_LEVEL: this.options.logLevel,
      },
    });

    let configPath;
    if (this.options.config instanceof Array) {
      configPath = dataRoot.join("toxiproxy/config.json");
      await configPath.writeJsonPretty(this.options.config);
    } else {
      configPath = this.options.config;
    }

    $`toxiproxy-server -config "${configPath}"`
      .withOptions(options)
      .spawn();
  }
}
