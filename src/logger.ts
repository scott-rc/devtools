import { assert, LogLevelNames, serializeError, stdColors, stdDatetime, stdLog, stdYaml } from "./deps.ts";
import { logRoot } from "./path.ts";
import { defaults } from "./utils.ts";

interface DevtoolsConsoleOptions {
  level: stdLog.LevelName;
  color: (s: string) => string;
  padStart: number;
}

const BaseHandler = stdLog.handlers.BaseHandler;

export class DevtoolsConsole extends BaseHandler {
  options: DevtoolsConsoleOptions;
  padding;

  constructor(options: DevtoolsConsoleOptions) {
    super(options.level);
    this.options = options;
    this.padding = " ".repeat(options.padStart);
  }

  override format(record: stdLog.LogRecord): string {
    const prefix = `${this.padding}${this.options.color(record.loggerName)}: `;
    const fields = formatFields(prefix, record);
    return `${prefix}${record.msg}${fields}`;
  }

  override log(msg: string): void {
    console.log(msg);
  }
}

export class DevtoolsLogger {
  setup(options: Partial<DevtoolsConsoleOptions> = {}): void {
    const opts = defaults<DevtoolsConsoleOptions>(options, {
      level: "INFO",
      color: stdColors.gray,
      padStart: 0,
    });

    if (!options.level) {
      // if no level was specified, check the LOG_LEVEL environment variable.
      const envLevel = Deno.env.get("LOG_LEVEL");
      if (envLevel) {
        if (LogLevelNames.includes(envLevel)) {
          opts.level = envLevel as stdLog.LevelName;
        } else {
          console.warn(
            stdColors.yellow(
              `Invalid LOG_LEVEL ${envLevel}. Must be one of ${LogLevelNames.join(", ")}. Using ${opts.level} instead.`,
            ),
          );
        }
      }
    }

    stdLog.setup({
      handlers: {
        devtoolsConsole: new DevtoolsConsole(opts),
        devtoolsFile: new stdLog.handlers.FileHandler(opts.level, {
          filename: logRoot.join("devtools.log").toString(),
          mode: "a",
          formatter(record) {
            const prefix = `[${stdDatetime.format(record.datetime, "yyyy-MM-dd HH:mm:ss")}] ${record.levelName} `;
            const fields = formatFields(prefix, record);
            return `${prefix}${record.msg}${fields}`;
          },
        }),
      },
      loggers: {
        "devtools": {
          level: opts.level,
          handlers: ["devtoolsConsole", "devtoolsFile"],
        },
      },
    });
  }

  get #logger(): stdLog.Logger {
    return stdLog.getLogger("devtools");
  }

  debug(msg: string, fields?: Record<string, unknown>): void {
    this.#logger.debug(msg, fields);
  }

  info(msg: string, fields?: Record<string, unknown>): void {
    this.#logger.info(msg, fields);
  }

  warn(msg: string, fields?: Record<string, unknown>): void {
    this.#logger.warning(msg, fields);
  }

  error(msg: string, fields?: Record<string, unknown>): void {
    this.#logger.error(msg, fields);
  }

  critical(msg: string, fields?: Record<string, unknown>): void {
    this.#logger.critical(msg, fields);
  }
}

export const logger = new DevtoolsLogger();

export function formatFields(prefix: string, record: stdLog.LogRecord): string {
  if (record.args.length === 0 || record.args[0] == null) return "";

  assert(
    record.args.length === 1 && typeof record.args[0] === "object" && !Array.isArray(record.args[0]),
    "arguments must be a single object of key/value pairs",
  );

  // clone the object so we don't modify the original
  const fields = { ...record.args[0] as Record<string, unknown> };
  if (fields.error) {
    fields.error = serializeError(fields.error);
  }

  const lines = [];
  const str = stdYaml.stringify(fields, { skipInvalid: true });
  for (const line of str.split("\n")) {
    if (!line) continue;
    lines.push(`\n${prefix}  ${line}`);
  }
  return lines.join("");
}
