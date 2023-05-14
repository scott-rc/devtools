import { killChildProcesses, onShutdownSignal, onUncaughtException } from "../src/command.ts";
import { DateiLager } from "../src/dateilager.ts";
import { delay, stdColors } from "../src/deps.ts";
import { logger } from "../src/logger.ts";
import { Postgres } from "../src/postgres.ts";
import { Redis } from "../src/redis.ts";
import { ToxiProxy } from "../src/toxiproxy.ts";

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  Deno.addSignalListener(signal, onShutdownSignal);
}

for (const event of ["unhandledrejection", "error"] as const) {
  globalThis.addEventListener(event, onUncaughtException);
}

try {
  logger.setup({ padStart: 2 });

  const pg = new Postgres();
  await pg.start({ padStart: 2 });

  await pg.ensureDatabase("dl_dev");
  const dateilager = new DateiLager(pg.clone({ database: "dl_dev" }));
  await dateilager.start({ env: { DL_ENV: "dev" } });

  await pg.ensureDatabase("dl_test");
  const dateilagerTest = new DateiLager(pg.clone({ database: "dl_test" }), { port: 5052 });
  await dateilagerTest.start({ env: { DL_ENV: "test" } });

  const redis = new Redis();
  await redis.start({ padStart: 5 });

  const toxiproxy = new ToxiProxy();
  await toxiproxy.start({ padStart: 1 });

  await delay(5000);

  await killChildProcesses();
} catch (error) {
  logger.error(stdColors.bold(stdColors.red("ERROR RUNNING SERVICES")), { error });
  await killChildProcesses();
  globalThis.addEventListener("unload", () => Deno.exit(1));
}
