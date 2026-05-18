#!/usr/bin/env bun
import path from "node:path";
import { at2ConfigJsonSchema } from "../src/config/json-schema.ts";

const out = path.resolve(import.meta.dir, "..", "atrium-config.schema.json");
const json = `${JSON.stringify(at2ConfigJsonSchema(), null, 2)}\n`;
await Bun.write(out, json);
console.log(`wrote ${path.relative(process.cwd(), out)}`);
