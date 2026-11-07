import type { Filter, Item, Loader } from '../src/types';

export type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
};

export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export function makeLoader() {
  const pending = new Map<Filter, Deferred<Item[]>>();
  const loader: Loader = (filter) => {
    const d = deferred<Item[]>();
    pending.set(filter, d);
    return d.promise;
  };
  return { loader, pending };
}