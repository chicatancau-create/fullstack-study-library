import { Profiler, useState } from 'react';
import { MemoChild } from './Reconcile';

export type ProfileRecord = {
  id: string;
  phase: 'mount' | 'update' | 'nested-update';
  actualDuration: number;
  baseDuration: number;
  commitTime: number;
  reason: string;
};

export const profileLog: ProfileRecord[] = [];
let currentReason = 'initial';

export function setReason(reason: string) {
  currentReason = reason;
}

export function resetProfiles() {
  profileLog.length = 0;
  currentReason = 'initial';
}

export function ProfiledCounter() {
  const [n, setN] = useState(0);
  return (
    <Profiler
      id="e05-lab"
      onRender={(id, phase, actualDuration, baseDuration, _startTime, commitTime) => {
        profileLog.push({ id, phase, actualDuration, baseDuration, commitTime, reason: currentReason });
      }}
    >
      <button
        onClick={() => {
          setReason('state:n+1');
          setN((v) => v + 1);
        }}
      >
        n+1
      </button>
      <MemoChild value={n} />
    </Profiler>
  );
}
