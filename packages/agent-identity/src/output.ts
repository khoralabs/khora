export type ToolErrorOutput = {
  ok: false;
  error: string;
};

export type ToolSuccessOutput<
  DATA extends Record<string, unknown> | undefined = undefined,
> = {
  ok: true;
  data?: DATA;
};

export type ToolOutput<
  DATA extends Record<string, unknown> | undefined = undefined,
> = ToolErrorOutput | ToolSuccessOutput<DATA>;

export async function withFormattedResults<
  DATA extends Record<string, unknown> | undefined = undefined,
>(promise: Promise<DATA>): Promise<ToolOutput<DATA>> {
  try {
    const data = await promise;
    return {
      ok: true,
      data,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
