import { ValidationError, parseRecord, totalMinutes } from '../src/record.ts';

const order: string[] = [];

setTimeout(() => order.push('timeout'), 0);
queueMicrotask(() => order.push('microtask'));
order.push('sync');

await Promise.resolve();
order.push('after-await');

await new Promise<void>((resolve) => setTimeout(resolve, 0));
order.push('after-timeout');

const expected = ['sync', 'microtask', 'after-await', 'timeout', 'after-timeout'];
console.log(`order: ${order.join(' -> ')}`);
if (JSON.stringify(order) !== JSON.stringify(expected)) {
  console.error('EVENT LOOP FAIL');
  process.exit(1);
}

const record = parseRecord({ id: 'r1', title: '读协议', minutes: 25, tags: ['net'] });
console.log(`total: ${totalMinutes([record])}`);

try {
  parseRecord({ id: '', title: 'x', minutes: 1 });
} catch (error) {
  if (error instanceof ValidationError) {
    console.log(`validation: field=${error.field}`);
  } else {
    console.error('VALIDATION FAIL: 不是 ValidationError');
    process.exit(1);
  }
}

console.log('DEMO PASS');