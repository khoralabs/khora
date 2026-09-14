import type { Dirent } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import { mkdir, open, readdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";

export type ObjectMetadata = { byteLength: number; etag?: string };

export interface ObjectStorePort {
  putImmutable(key: string, bytes: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array | undefined>;
  head(key: string): Promise<ObjectMetadata | undefined>;
  listPrefix(prefix: string): Promise<string[]>;
  deletePrefix(prefix: string): Promise<void>;
}

function safeKey(key: string): string {
  if (!key || key.startsWith("/") || key.split("/").some((part) => part === "..")) {
    throw new Error("invalid object key");
  }
  return key;
}

/** Creates a local store only when an explicit root directory is provided. */
export function createLocalFilesystemObjectStore(rootDirectory: string): ObjectStorePort {
  if (!rootDirectory.trim()) throw new Error("object store root directory is required");
  const root = path.resolve(rootDirectory);
  const objectPath = (key: string) => path.join(root, safeKey(key));
  return {
    async putImmutable(key, bytes) {
      const file = objectPath(key);
      await mkdir(path.dirname(file), { recursive: true });
      let handle: FileHandle | undefined;
      try {
        handle = await open(file, "wx");
        await handle.writeFile(bytes);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
          throw new Error(`object already exists: ${key}`);
        }
        throw error;
      } finally {
        await handle?.close();
      }
    },
    async get(key) {
      try {
        return new Uint8Array(await readFile(objectPath(key)));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
        throw error;
      }
    },
    async head(key) {
      try {
        return { byteLength: (await stat(objectPath(key))).size };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
        throw error;
      }
    },
    async listPrefix(prefix) {
      const keys: string[] = [];
      async function walk(directory: string): Promise<void> {
        let entries: Dirent[];
        try {
          entries = await readdir(directory, { withFileTypes: true });
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
          throw error;
        }
        for (const entry of entries) {
          const file = path.join(directory, entry.name);
          if (entry.isDirectory()) await walk(file);
          else {
            const key = path.relative(root, file).split(path.sep).join("/");
            if (key.startsWith(prefix)) keys.push(key);
          }
        }
      }
      await walk(root);
      return keys.sort();
    },
    async deletePrefix(prefix) {
      await Promise.all((await this.listPrefix(prefix)).map((key) => rm(objectPath(key))));
    },
  };
}

export type S3ObjectStoreConfig = {
  bucket: string;
  prefix?: string;
  client?: S3Client;
  clientConfig?: S3ClientConfig;
};

export function createS3ObjectStore(config: S3ObjectStoreConfig): ObjectStorePort {
  if (!config.bucket) throw new Error("S3 bucket is required");
  const client = config.client ?? new S3Client(config.clientConfig ?? {});
  const base = config.prefix?.replace(/^\/|\/$/g, "");
  const remoteKey = (key: string) => (base ? `${base}/${safeKey(key)}` : safeKey(key));
  const remotePrefix = (prefix: string) => (prefix ? remoteKey(prefix) : base ? `${base}/` : "");
  const localKey = (key: string) => (base ? key.slice(base.length + 1) : key);
  return {
    async putImmutable(key, bytes) {
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: remoteKey(key),
          Body: bytes,
          IfNoneMatch: "*",
        }),
      );
    },
    async get(key) {
      try {
        const result = await client.send(
          new GetObjectCommand({ Bucket: config.bucket, Key: remoteKey(key) }),
        );
        return result.Body ? new Uint8Array(await result.Body.transformToByteArray()) : undefined;
      } catch (error) {
        if ((error as { name?: string }).name === "NoSuchKey") return undefined;
        throw error;
      }
    },
    async head(key) {
      try {
        const result = await client.send(
          new HeadObjectCommand({ Bucket: config.bucket, Key: remoteKey(key) }),
        );
        return { byteLength: result.ContentLength ?? 0, etag: result.ETag };
      } catch (error) {
        if (
          (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404
        )
          return undefined;
        throw error;
      }
    },
    async listPrefix(prefix) {
      const keys: string[] = [];
      let token: string | undefined;
      do {
        const result = await client.send(
          new ListObjectsV2Command({
            Bucket: config.bucket,
            Prefix: remotePrefix(prefix),
            ContinuationToken: token,
          }),
        );
        keys.push(...(result.Contents ?? []).flatMap(({ Key }) => (Key ? [localKey(Key)] : [])));
        token = result.NextContinuationToken;
      } while (token);
      return keys.sort();
    },
    async deletePrefix(prefix) {
      const keys = await this.listPrefix(prefix);
      for (let i = 0; i < keys.length; i += 1_000) {
        await client.send(
          new DeleteObjectsCommand({
            Bucket: config.bucket,
            Delete: { Objects: keys.slice(i, i + 1_000).map((key) => ({ Key: remoteKey(key) })) },
          }),
        );
      }
    },
  };
}
