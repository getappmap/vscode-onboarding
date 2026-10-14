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

/**
 * Holds work back while an agent is busy. `busy()` starts a hold, or makes it longer.
 * `run(fn)` runs fn now, or once the hold ends; only the last fn passed is kept.
 */
export function holdWhileBusy(ms: number): { busy(): void; run(fn: () => void): void; cancel(): void } {
  let until = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let waiting: (() => void) | undefined;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const fn = waiting;
      waiting = undefined;
      fn?.();
    }, until - Date.now());
  };
  return {
    busy() {
      until = Date.now() + ms;
      if (waiting) {
        schedule();
      }
    },
    run(fn) {
      if (Date.now() >= until) {
        fn();
        return;
      }
      waiting = fn;
      schedule();
    },
    cancel() {
      clearTimeout(timer);
      waiting = undefined;
    },
  };
}
