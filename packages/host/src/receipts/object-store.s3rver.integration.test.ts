import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
import S3rver from "s3rver";
import {
  createDeliveryReceiptStore,
  createS3ObjectStore,
  receiptManifestPath,
  receiptPrefix,
} from ".";

test("S3 receipt storage round-trips through s3rver", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "khora-s3rver-"));
  const server = new S3rver({
    address: "127.0.0.1",
    port: 0,
    directory,
    silent: true,
  });

  try {
    const address = await server.run();
    const client = new S3Client({
      endpoint: `http://127.0.0.1:${address.port}`,
      region: "us-east-1",
      forcePathStyle: true,
      credentials: {
        accessKeyId: "S3RVER",
        secretAccessKey: "S3RVER",
      },
    });
    await client.send(new CreateBucketCommand({ Bucket: "receipts" }));

    const objects = createS3ObjectStore({
      bucket: "receipts",
      prefix: "integration",
      client,
    });
    const receipts = createDeliveryReceiptStore(objects);
    const written = await receipts.write(
      "tenant/post",
      { target: [1, 2, 65_537], delivered: [1, 65_537], failed: [2] },
      123,
    );

    expect(written.available).toBe(true);
    if (!written.available) throw new Error("expected available receipts");
    expect(await receipts.getManifest("tenant/post")).toEqual(written.manifest);
    expect(await objects.listPrefix(`${receiptPrefix("tenant/post")}/`)).toContain(
      receiptManifestPath("tenant/post"),
    );
    // s3rver does not enforce S3 If-None-Match writes, but the receipt layer
    // still makes identical retries idempotent by comparing existing bytes.
    expect(
      await receipts.write(
        "tenant/post",
        { target: [1, 2, 65_537], delivered: [1, 65_537], failed: [2] },
        123,
      ),
    ).toEqual(written);

    await objects.deletePrefix(`${receiptPrefix("tenant/post")}/`);
    expect(await objects.listPrefix(`${receiptPrefix("tenant/post")}/`)).toEqual([]);
    client.destroy();
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
