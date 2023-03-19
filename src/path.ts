import { PathRef } from "./deps.ts";

export function path(p: string | URL | ImportMeta | PathRef): PathRef {
  if (p instanceof PathRef) return p;
  return new PathRef(p);
}

export const workspaceRoot = path(Deno.env.get("WORKSPACE_ROOT") ?? Deno.cwd());

export const dataRoot = path(Deno.env.get("DATA_ROOT") ?? workspaceRoot.join("tmp"));
dataRoot.mkdirSync({ recursive: true });

export const logRoot = path(Deno.env.get("LOG_ROOT") ?? dataRoot.join("log"));
logRoot.mkdirSync({ recursive: true });
