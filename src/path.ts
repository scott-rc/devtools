import { stdFs, stdPath } from "./deps.ts";
import { ignoreNotFound } from "./fs.ts";

type PathLike = string | URL | ImportMeta | Path;

export function path(path: PathLike): Path {
  return new Path(path);
}

export class Path {
  /**
   * This is a special symbol that allows different versions of `Path` to match `instanceof` checks. Ideally people
   * shouldn't be mixing versions, but if it happens then this will maybe reduce some bugs (or cause some... tbd).
   *
   * @internal
   */
  private static instanceofSymbol = Symbol.for("devtools.Path");

  readonly #path: string;

  constructor(path: PathLike) {
    if (path instanceof URL) {
      this.#path = stdPath.fromFileUrl(path);
    } else if (path instanceof Path) {
      this.#path = path.toString();
    } else if (typeof path === "string") {
      if (path.startsWith("file://")) {
        this.#path = stdPath.fromFileUrl(path);
      } else {
        this.#path = path;
      }
    } else {
      this.#path = stdPath.fromFileUrl(path.url);
    }
  }

  toString(): string {
    return this.#path;
  }

  // path methods

  resolve(...pathSegments: string[]): Path {
    return new Path(stdPath.resolve(this.#path, ...pathSegments));
  }

  join(...segments: string[]): Path {
    return new Path(stdPath.join(this.#path, ...segments));
  }

  parent(): Path | null {
    const parent = stdPath.dirname(this.#path);
    if (parent === this.#path) return null;
    return new Path(parent);
  }

  parentOrThrow(): Path {
    const parent = this.parent();
    if (!parent) throw new Error(`No parent for ${this}`);
    return parent;
  }

  // fs methods

  ensureDir(): Promise<void> {
    return stdFs.ensureDir(this.#path);
  }

  ensureDirSync(): void {
    return stdFs.ensureDirSync(this.#path);
  }

  ensureFile(): Promise<void> {
    return stdFs.ensureFile(this.#path);
  }

  ensureFileSync(): void {
    return stdFs.ensureFileSync(this.#path);
  }

  // Deno methods

  async lstat(): Promise<Deno.FileInfo | null> {
    try {
      return await Deno.lstat(this.#path);
    } catch (error) {
      ignoreNotFound(error);
      return null;
    }
  }

  lstatSync(): Deno.FileInfo | null {
    try {
      return Deno.lstatSync(this.#path);
    } catch (error) {
      ignoreNotFound(error);
      return null;
    }
  }

  async exists(): Promise<boolean> {
    const info = await this.lstat();
    return info != null;
  }

  existsSync(): boolean {
    return this.lstatSync() != null;
  }

  async realPath(): Promise<Path> {
    return new Path(await Deno.realPath(this.#path));
  }

  async writeTextFile(text: string): Promise<void> {
    await this.parent()?.ensureDir();
    return Deno.writeTextFile(this.#path, text);
  }

  writeJson(value: unknown): Promise<void> {
    return this.writeTextFile(JSON.stringify(value));
  }

  writeJsonPretty(value: unknown, spaces = 2): Promise<void> {
    return this.writeTextFile(JSON.stringify(value, null, spaces));
  }

  remove(options?: Deno.RemoveOptions): Promise<void> {
    return Deno.remove(this.#path, options);
  }

  createSymlinkTo(to: PathLike, options?: Deno.SymlinkOptions): Promise<void> {
    return Deno.symlink(this.#path, to.toString(), options);
  }
}

export const workspaceRoot = path(Deno.env.get("WORKSPACE_ROOT") ?? Deno.cwd());

export const dataRoot = path(Deno.env.get("DATA_ROOT") ?? workspaceRoot.join("tmp"));
await dataRoot.ensureDir();

export const logRoot = path(Deno.env.get("LOG_ROOT") ?? dataRoot.join("log"));
await logRoot.ensureDir();
