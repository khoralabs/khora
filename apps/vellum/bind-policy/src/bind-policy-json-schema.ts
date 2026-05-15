/**
 * Canonical **`bind_policy`** on NBC ports and persistence: a **JSON Schema** document
 * (draft 2020-12) whose root **`type`** is **`object`**, describing the **`bind_payload`** instance.
 */

import type { JsonDocument } from "@khoralabs/obp-v2-model";

/** JSON Schema root document stored as JSON (`Document` / **`JsonDocument`** in OBP). */
export type BindPolicyJsonSchema = { readonly [key: string]: JsonDocument };
