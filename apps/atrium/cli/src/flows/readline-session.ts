import { stdin as input, stdout as output } from "node:process";
import * as readline from "node:readline/promises";
import type { ReadLineFn } from "./obp/bind-readline.ts";

export function createReadlineSession(): {
  readLine: ReadLineFn;
  close: () => void;
} {
  const rl = readline.createInterface({ input, output });
  return {
    readLine: (prompt: string) => rl.question(prompt),
    close: () => rl.close(),
  };
}
