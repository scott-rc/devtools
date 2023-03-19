import { deepMerge, DeepMergeOptions, PartialDeep } from "./deps.ts";

// deno-lint-ignore ban-types
export function defaults<T extends {}>(
  passed: PartialDeep<T>,
  defaults: T,
  deepMergeOptions?: Readonly<DeepMergeOptions>,
): T {
  return deepMerge(defaults, passed, deepMergeOptions) as T;
}
