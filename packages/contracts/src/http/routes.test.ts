import { describe, expect, test } from "bun:test";
import {
  KHORA_DISCOVERY_ENDPOINTS,
  KHORA_HTTP_PATH,
  khoraPostByIdPath,
  khoraProfileByDidPath,
  khoraProfileByUsernamePath,
  khoraRelationshipAcceptPath,
  khoraRelationshipByIdPath,
  khoraRelationshipDeclinePath,
  khoraRelationshipRevokePath,
} from "./routes";

describe("KHORA_HTTP_PATH", () => {
  test("discovery endpoints match route map", () => {
    expect(KHORA_DISCOVERY_ENDPOINTS).toEqual({
      health: KHORA_HTTP_PATH.health,
      ready: KHORA_HTTP_PATH.ready,
      register: KHORA_HTTP_PATH.register,
    });
  });

  test("path builders encode URI components", () => {
    expect(khoraPostByIdPath("a/b")).toBe("/v1/posts/a%2Fb");
    expect(khoraProfileByDidPath("did:key:z")).toBe("/v1/profile/by-did/did%3Akey%3Az");
    expect(khoraProfileByUsernamePath("Ada Lovelace")).toBe(
      "/v1/profile/by-username/Ada%20Lovelace",
    );
    expect(KHORA_HTTP_PATH.relationships).toBe("/v1/relationships");
    expect(khoraRelationshipByIdPath("ch/1")).toBe("/v1/relationships/ch%2F1");
    expect(khoraRelationshipAcceptPath("ch1")).toBe("/v1/relationships/ch1/accept");
    expect(khoraRelationshipDeclinePath("ch1")).toBe("/v1/relationships/ch1/decline");
    expect(khoraRelationshipRevokePath("ch1")).toBe("/v1/relationships/ch1/revoke");
  });
});
