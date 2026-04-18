/**
 * Merges multiple async iterables into a single async generator, yielding
 * values in the order they resolve from each underlying iterator.
 *
 * Scheduling is fair in the sense that every iterator always has a pending
 * `next()` in-flight, so whichever iterator produces a value first is the one
 * whose value gets yielded next. Slow iterators cannot block fast ones.
 *
 * When the consumer breaks, throws, or returns early, `return()` is called on
 * every underlying iterator so they can release resources.
 */
export async function* mergeAsyncIterators<T>(
  iterables: Iterable<AsyncIterable<T>>,
): AsyncGenerator<T, void, undefined> {
  const iterators = Array.from(iterables, (it) => it[Symbol.asyncIterator]());

  type Settled = { index: number; result: IteratorResult<T> };
  const pending = new Map<number, Promise<Settled>>();

  const advance = (index: number, iterator: AsyncIterator<T>) => {
    pending.set(
      index,
      iterator.next().then((result) => ({ index, result })),
    );
  };

  iterators.forEach((it, i) => {
    advance(i, it);
  });

  try {
    while (pending.size > 0) {
      const { index, result } = await Promise.race(pending.values());
      if (result.done) {
        pending.delete(index);
      } else {
        advance(index, iterators[index] as AsyncIterator<T>);
        yield result.value;
      }
    }
  } finally {
    // Prevent unhandled rejections from in-flight `next()` calls we're
    // abandoning, then signal completion to every iterator.
    for (const p of pending.values()) p.catch(() => {});
    await Promise.all(
      iterators.map(async (it) => {
        try {
          await it.return?.(undefined);
        } catch {
          // Swallow cleanup errors; the original error (if any) takes priority.
        }
      }),
    );
  }
}
