import { serializeError, shell, stdAsserts, stdBytes, stdColors } from "./deps.ts";
import { logger } from "./logger.ts";
import { Path } from "./path.ts";
import { defaults } from "./utils.ts";

export function $(strings: TemplateStringsArray, ...exprs: unknown[]): Command {
  const string = String.raw(strings, ...exprs);
  const [command, ...args] = shell.parse(string, Deno.env.toObject());
  return new Command(command, { args });
}

export interface CommandOptions extends Deno.CommandOptions {
  /**
   * Name of the command.
   *
   * Used to prefix log messages.
   */
  name: string;

  /**
   * Color function to use for the command name.
   *
   * @param name The name of the command.
   * @returns The colorized name.
   */
  color: (name: string) => string;

  /**
   * Number of spaces to pad the command name with.
   *
   * Useful for aligning command names.
   */
  padStart: number;

  /**
   * Whether to print the command before running it.
   */
  printCommand: boolean;

  /**
   * Whether to suppress the commands output.
   */
  quiet: boolean;

  /**
   * File to log the command output to.
   */
  logFile?: Path;

  /**
   * Exit codes that the command is expected to exit with.
   *
   * If the command exits with a code that isn't in this list, an error is thrown.
   *
   * @default [0]
   */
  expectedExitCodes: number[];

  /**
   * Signal to send to the command when it is killed.
   *
   * @default "SIGTERM"
   */
  killSignal: Deno.Signal;

  /**
   * Function that is used to check if the command has started successfully.
   *
   * This function is used when the {@linkcode ChildProcess.waitForStartupProbe} method is called. The function should
   * throw an error if the command did not start successfully.
   *
   * @returns When the command has successfully started.
   * @throws If the command did not start successfully.
   */
  startupProbe?: () => Promise<unknown>;
}

export type PartialCommandOptions = Partial<CommandOptions>;

export class Command implements PromiseLike<ChildProcess> {
  options: CommandOptions;

  constructor(public cmd: string, options: PartialCommandOptions = {}) {
    this.options = defaults<CommandOptions>(options, {
      name: cmd,
      color: (s) => s,
      padStart: 0,
      quiet: false,
      printCommand: false,
      logFile: undefined,
      killSignal: "SIGTERM",
      expectedExitCodes: [0],
    });
  }

  withOptions(options?: PartialCommandOptions): Command {
    return new Command(this.cmd, { ...this.options, ...options });
  }

  name(name: string): Command {
    return new Command(this.cmd, { ...this.options, name });
  }

  color(color: (s: string) => string): Command {
    return new Command(this.cmd, { ...this.options, color });
  }

  padStart(padStart: number): Command {
    return new Command(this.cmd, { ...this.options, padStart });
  }

  printCommand(printCommand = true): Command {
    return new Command(this.cmd, { ...this.options, printCommand });
  }

  quiet(quiet = true): Command {
    return new Command(this.cmd, { ...this.options, quiet });
  }

  logFile(logFile: Path): Command {
    return new Command(this.cmd, { ...this.options, logFile });
  }

  expectedExitCodes(...expectedExitCodes: number[]): Command {
    return new Command(this.cmd, { ...this.options, expectedExitCodes });
  }

  killSignal(killSignal: Deno.Signal): Command {
    return new Command(this.cmd, { ...this.options, killSignal });
  }

  startupProbe(startupProbe: () => Promise<unknown>): Command {
    return new Command(this.cmd, { ...this.options, startupProbe });
  }

  env(env: Record<string, string>): Command {
    return new Command(this.cmd, { ...this.options, env });
  }

  spawn(): ChildProcess {
    return new ChildProcess(this);
  }

  async output(): Promise<string> {
    const process = this.spawn();

    const buffer: string[] = [];
    const promises: Promise<void>[] = [];

    for (const stream of [process.stdout, process.stderr]) {
      promises.push((async () => {
        for await (const line of lines(stream)) {
          buffer.push(line);
        }
      })());
    }

    await Promise.all(promises);

    return buffer.join("\n");
  }

  async then<R = ChildProcess, E = UnexpectedExitCode>(
    onfulfilled?: (value: ChildProcess) => PromiseLike<R> | R,
    onrejected?: (reason: UnexpectedExitCode) => PromiseLike<E> | E,
  ): Promise<R | E> {
    const process = this.spawn();
    try {
      await process;
      if (onfulfilled) return onfulfilled(process);
      return process as R;
    } catch (error) {
      if (onrejected) return onrejected(error);
      throw error;
    }
  }
}

export class ChildProcess implements PromiseLike<void> {
  #process!: Deno.ChildProcess;
  #status: Deno.CommandStatus | undefined;

  stdout!: ReadableStream<Uint8Array>;
  stderr!: ReadableStream<Uint8Array>;

  constructor(public command: Command) {
    this.#start();
  }

  get isRunning(): boolean {
    return this.#status == null;
  }

  get status(): Deno.CommandStatus {
    stdAsserts.assert(
      this.#status != null,
      "ChildProcess is still running. Either `await` it or check `isRunning` before accessing `status`",
    );
    return this.#status;
  }

  #start(): void {
    if (this.command.options.printCommand) {
      const cmd = this.command.cmd;
      const args = this.command.options.args ?? [];
      console.log(`$ ${shell.quote([cmd, ...args])}`);
    }

    const process = new Deno.Command(this.command.cmd, {
      stdout: "piped",
      stderr: "piped",
      ...this.command.options,
    }).spawn();

    this.#process = process;

    childProcesses.add(this);
    process.status.finally(() => childProcesses.delete(this));

    for (const streamName of ["stdout", "stderr"] as const) {
      let stream = process[streamName];

      if (this.command.options.logFile) {
        this.command.options.logFile.ensureFileSync();
        const file = Deno.openSync(this.command.options.logFile.toString(), { append: true });

        let fileStream;
        [stream, fileStream] = stream.tee();
        fileStream.pipeTo(file.writable);
      }

      if (!this.command.options.quiet) {
        let inheritStream;
        [stream, inheritStream] = stream.tee();

        const encoder = new TextEncoder();
        const padding = " ".repeat(this.command.options.padStart);
        const name = this.command.options.color(this.command.options.name);
        const prefix = encoder.encode(`${padding}${name}: `);
        const newline = encoder.encode("\n");

        (async () => {
          for await (const line of lines(inheritStream)) {
            await Deno[streamName].write(stdBytes.concat(prefix, encoder.encode(line), newline));
          }
        })();
      }

      this[streamName] = stream;
    }
  }

  async then<R = void, E = UnexpectedExitCode>(
    onfulfilled?: (value: void) => PromiseLike<R> | R,
    onrejected?: (reason: UnexpectedExitCode) => PromiseLike<E> | E,
  ): Promise<R | E> {
    this.#status ??= await this.#process.status;

    if (this.command.options.expectedExitCodes.includes(this.#status.code)) {
      if (onfulfilled) return onfulfilled(void 0);
      return void 0 as R;
    }

    const error = new UnexpectedExitCode(this.command, `Unexpected exit code ${this.#status.code}`);
    if (onrejected) return onrejected(error);
    throw error;
  }

  async waitForStartupProbe(): Promise<void> {
    stdAsserts.assert(this.command.options.startupProbe, `${this.command.options.name} does not have a startup probe`);

    try {
      // wait for either the command to finish or the startup probe to succeed
      await Promise.race([this, this.command.options.startupProbe()]);
    } catch (cause) {
      throw new FailedStartupProbe(this.command, { cause });
    }

    if (!this.isRunning) {
      throw new FailedStartupProbe(this.command, {
        message: `${this.command.options.name} exited before startup probe succeeded`,
        cause: this.#status,
      });
    }
  }

  async kill(signal: Deno.Signal = this.command.options.killSignal): Promise<void> {
    if (!this.isRunning) return;
    this.#process.kill(signal);
    await this;
  }
}

const childProcesses = new Set<ChildProcess>();

export async function killChildProcesses(): Promise<void> {
  // kill the child processes in reverse order, similar to defer in Go
  for (const process of [...childProcesses].reverse()) {
    try {
      await process.kill();
    } catch (error) {
      logger.error("Error killing process", { error, process });
    }
  }
}

export async function onShutdownSignal(): Promise<void> {
  // copy the set so we have have a reference to the commands that were running when we received the signal
  const processes = [...childProcesses];

  // if we received a shutdown signal, all our processes have received the signal too, so wait for them to finish
  const results = await Promise.allSettled(processes);

  // if any of the processes failed, exit with a non-zero exit code
  const exitCode = results.some((result) => result.status === "rejected") ? 1 : 0;

  // we might have more async work to do, so wait for the event loop to be empty before exiting
  globalThis.addEventListener("unload", () => Deno.exit(exitCode));
}

export async function onUncaughtException(event: ErrorEvent | PromiseRejectionEvent): Promise<void> {
  // prevent immediate exit
  event.preventDefault();

  logger.error(stdColors.bold(stdColors.red("UNCAUGHT EXCEPTION")), {
    event: "error" in event
      ? { type: event.type, cause: serializeError(event.error), message: event.message }
      : { type: event.type, cause: serializeError(event.reason) },
  });

  await killChildProcesses();

  // we might have more async work to do, so wait for the event loop to be empty before exiting
  globalThis.addEventListener("unload", () => Deno.exit(1));
}

/**
 * Thrown when a child process exits with an unexpected exit code.
 */
export class UnexpectedExitCode extends Error {
  readonly name = "UnexpectedExitCode";

  constructor(public command: Command, message: string) {
    super(message);
  }
}

/**
 * Thrown when a child process fails to pass its startup probe.
 */
export class FailedStartupProbe extends Error {
  readonly name = "FailedStartupProbe";

  constructor(public command: Command, options: { message?: string; cause?: unknown }) {
    const message = options.message ?? `${command.options.name} startup probe failed`;
    super(message, { cause: options.cause });
  }
}

/**
 * Returns UTF-8 lines from a stream.
 *
 * @param stream The stream to read lines from.
 */
async function* lines(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder();

  // leftover stores the last line that didn't end with a newline
  let leftover = "";

  for await (const chunk of stream) {
    const lines = (leftover + decoder.decode(chunk)).split("\n");
    leftover = lines.pop() ?? "";
    for (const line of lines) yield line;
  }

  return leftover;
}
