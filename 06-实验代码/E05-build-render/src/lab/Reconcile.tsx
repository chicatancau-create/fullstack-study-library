import { memo, useState } from 'react';
import { bump } from './counters';

export function PlainChild({ value }: { value: number }) {
  bump('plain');
  return <p>plain:{value}</p>;
}

export const MemoChild = memo(function MemoChild({ value }: { value: number }) {
  bump('memo');
  return <p>memo:{value}</p>;
});

export function Parent() {
  const [value, setValue] = useState(0);
  const [tick, setTick] = useState(0);
  return (
    <section>
      <button onClick={() => setValue((v) => v + 1)}>value+1</button>
      <button onClick={() => setTick((t) => t + 1)}>tick+1</button>
      <output data-testid="tick">{tick}</output>
      <PlainChild value={value} />
      <MemoChild value={value} />
    </section>
  );
}

function Row({ label }: { label: string }) {
  const [note, setNote] = useState('');
  bump(`row:${label}`);
  return (
    <li>
      <span>{label}</span>
      <input aria-label={`note-${label}`} value={note} onChange={(e) => setNote(e.target.value)} />
    </li>
  );
}

export function KeyedList({ items, indexed = false }: { items: string[]; indexed?: boolean }) {
  return (
    <ul>
      {items.map((label, i) => (
        <Row key={indexed ? i : label} label={label} />
      ))}
    </ul>
  );
}

export function Remount({ nonce }: { nonce: number }) {
  return <Row key={nonce} label="remount" />;
}
