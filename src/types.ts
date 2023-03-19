import { SetRequired } from "./deps.ts";

export type PartialExcept<T, K extends keyof T> = SetRequired<Partial<T>, K>;
