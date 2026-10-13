/**
 * Returns a function that runs `fn` once calls to it have stopped for `ms`. Used to wait
 * until someone, or an agent, has finished saving a set of files before looking at them.
 */
export function whenQuiet(fn: () => void, ms: number): (() => void) & { cancel(): void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const call = () => {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
  return Object.assign(call, { cancel: () => clearTimeout(timer) });
}
