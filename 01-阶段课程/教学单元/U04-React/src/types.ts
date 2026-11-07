export type Filter = 'all' | 'draft' | 'done';

export type Record = {
  id: number;
  title: string;
  minutes: number;
  status: 'draft' | 'done';
};

export type Loader = (filter: Filter, signal: AbortSignal) => Promise<Record[]>;