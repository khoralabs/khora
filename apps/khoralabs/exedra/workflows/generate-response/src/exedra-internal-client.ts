export type ExedraInternalClient = {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body: unknown): Promise<T>;
};

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} environment variable not set`);
  }
  return value;
}

export function createExedraInternalClient(): ExedraInternalClient {
  const baseUrl = requireEnv("EXEDRA_INTERNAL_URL").replace(/\/$/, "");
  const token = requireEnv("EXEDRA_INTERNAL_TOKEN");
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  async function parse<T>(res: Response): Promise<T> {
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Exedra internal request failed ${res.status}: ${body}`);
    }
    return (await res.json()) as T;
  }

  return {
    get: async <T>(path: string) => parse<T>(await fetch(`${baseUrl}${path}`, { headers })),
    post: async <T>(path: string, body: unknown) =>
      parse<T>(
        await fetch(`${baseUrl}${path}`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        }),
      ),
  };
}
