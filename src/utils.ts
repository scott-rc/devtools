import { PartialDeep, stdDeepMerge } from "./deps.ts";

// deno-lint-ignore ban-types
export function defaults<T extends {}>(
  passed: PartialDeep<T>,
  defaults: T,
  deepMergeOptions?: Readonly<stdDeepMerge.DeepMergeOptions>,
): T {
  return stdDeepMerge.deepMerge(defaults, passed, deepMergeOptions) as T;
}
