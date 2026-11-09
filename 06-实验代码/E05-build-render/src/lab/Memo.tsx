import { createContext, memo, useCallback, useContext, useMemo, useState } from 'react';
import { bump } from './counters';

const ObjectChild = memo(function ObjectChild({ options }: { options: { mode: string } }) {
  bump('object');
  return <p>mode:{options.mode}</p>;
});

const CallbackChild = memo(function CallbackChild({ onPick }: { onPick: () => void }) {
  bump('callback');
  return <button onClick={onPick}>pick</button>;
});

export const ThemeContext = createContext('light');

const ContextChild = memo(function ContextChild() {
  const theme = useContext(ThemeContext);
  bump('context');
  return <p>theme:{theme}</p>;
});

function Lab({ stable }: { stable: boolean }) {
  const [n, setN] = useState(0);
  const [theme, setTheme] = useState('light');
  const memoOptions = useMemo(() => ({ mode: 'stable' }), []);
  const memoPick = useCallback(() => {}, []);
  const options = stable ? memoOptions : { mode: 'stable' };
  const onPick = stable ? memoPick : () => {};
  return (
    <ThemeContext.Provider value={theme}>
      <button onClick={() => setN((v) => v + 1)}>rerender:{n}</button>
      <button onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}>theme</button>
      <ObjectChild options={options} />
      <CallbackChild onPick={onPick} />
      <ContextChild />
    </ThemeContext.Provider>
  );
}

export function MemoLabUnstable() {
  return <Lab stable={false} />;
}

export function MemoLabStable() {
  return <Lab stable />;
}
