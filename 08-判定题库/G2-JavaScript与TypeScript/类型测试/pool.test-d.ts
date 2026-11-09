// 类型层断言：由 `tsc -p tsconfig.json` 编译，任何一条不成立都会编译失败。
// 等价于 tsd 的 expectType，但不需要额外依赖。
import { createPool, type Pool, type PoolStats } from '../参考答案/ts/pool.ts';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;

const pool: Pool = createPool(2);

// run 的泛型透传任务返回值
const runNumber: Assert<Equal<ReturnType<typeof pool.run<number>>, Promise<number>>> = true;
const runString: Assert<Equal<ReturnType<typeof pool.run<string>>, Promise<string>>> = true;
void runNumber;
void runString;

// stats 的字段类型必须是 number
const stats: PoolStats = pool.stats();
const peak: Assert<Equal<typeof stats.peak, number>> = true;
const queued: Assert<Equal<typeof stats.queued, number>> = true;
void peak;
void queued;

// 参数与返回值形状不可互相替换
const notAny: Assert<Equal<Parameters<typeof createPool>[0], number>> = true;
void notAny;

// @ts-expect-error 任务必须是函数，传数字应当编译失败
pool.run(1);
