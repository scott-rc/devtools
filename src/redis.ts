import { $, PartialCommandOptions } from "./command.ts";
import { colors, PathRef, redis, RedisConnection, RedisConnectOptions } from "./deps.ts";
import { dataRoot, logRoot } from "./path.ts";
import { defaults } from "./utils.ts";

interface RedisOptions extends RedisConnectOptions {
  data?: PathRef;
}

export class Redis {
  #connection: RedisConnection | undefined;
  options: RedisOptions;

  constructor(options: Partial<RedisOptions> = {}) {
    this.options = defaults<RedisOptions>(options, {
      hostname: "127.0.0.1",
      port: 6379,
      data: dataRoot.join("redis"),
    });
  }

  get connection(): RedisConnection {
    if (!this.#connection) {
      throw new Error("Redis connection not started");
    }
    return this.#connection;
  }

  async start(options: PartialCommandOptions = {}): Promise<void> {
    options = defaults(options, {
      name: "redis",
      color: colors.red,
      logFile: logRoot.join(`${options.name ?? "redis"}.log`),
      startupProbe: async () => this.#connection = await redis(this.options),
    });

    const extraFlags = [];
    if (this.options.data) {
      await this.options.data.mkdir({ recursive: true });
      extraFlags.push(`--dir ${this.options.data}`);
    }

    await $`redis-server --port ${this.options.port} ${extraFlags}`
      .withOptions(options)
      .spawn()
      .waitForStartupProbe();
  }
}
