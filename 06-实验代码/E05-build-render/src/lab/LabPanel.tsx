import { KeyedList, Parent, Remount } from './Reconcile';
import { MemoLabStable, MemoLabUnstable } from './Memo';
import { ProfiledCounter } from './Profiler';
import { usedSum } from '../lib/optimize';

export default function LabPanel() {
  return (
    <section aria-label="E05 渲染实验">
      <h2>渲染实验</h2>
      <p>usedSum={usedSum([1, 2, 3])}</p>
      <Parent />
      <KeyedList items={['A', 'B']} />
      <KeyedList items={['A', 'B']} indexed />
      <Remount nonce={1} />
      <MemoLabUnstable />
      <MemoLabStable />
      <ProfiledCounter />
    </section>
  );
}
