export type Filter = 'a' | 'b';

export type Item = { id: number; title: string };

export type Loader = (filter: Filter, signal?: AbortSignal) => Promise<Item[]>;

export type Saver = (title: string) => Promise<Item>;