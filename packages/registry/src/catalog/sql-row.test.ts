import { describe, expect, test } from "bun:test";
import type { SnakeCaseKey } from "./sql-row";

type Expect<T extends true> = T;

describe("SnakeCaseKey", () => {
  test("maps common domain keys", async () => {
    type _id = Expect<SnakeCaseKey<"id"> extends "id" ? true : false>;
    type _baseUrl = Expect<SnakeCaseKey<"baseUrl"> extends "base_url" ? true : false>;
    type _healthReadyPath = Expect<
      SnakeCaseKey<"healthReadyPath"> extends "health_ready_path" ? true : false
    >;
    type _agentDid = Expect<SnakeCaseKey<"agentDid"> extends "agent_did" ? true : false>;
    type _boundViaHostId = Expect<
      SnakeCaseKey<"boundViaHostId"> extends "bound_via_host_id" ? true : false
    >;
    expect(true).toBe(true);
  });
});
