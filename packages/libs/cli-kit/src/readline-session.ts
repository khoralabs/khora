import { stdin as input, stdout as output } from "node:process";
import * as readline from "node:readline/promises";

export type ReadLineFn = (prompt: string) => Promise<string>;

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
