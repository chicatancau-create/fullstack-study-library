import { readFile } from 'node:fs/promises';
import { createPool } from './pool.ts';

export interface Job {
  id: string;
  ms: number;
}

export interface JobResult {
  id: string;
  status: 'ok' | 'cancelled' | 'error';
  value?: string;
  error?: string;
}

export interface CliOptions {
  file: string;
  limit: number;
  queue: number;
  json: boolean;
}

export class UsageError extends Error {
  readonly code = 2;
}

export class SchemaError extends Error {
  readonly code = 3;
}

const USAGE = `用法: node 参考答案/ts/cli.ts <jobs.json> [--limit N] [--queue N] [--json]

  jobs.json  JSON 数组，每项形如 {"id":"a","ms":10}
  --limit N  并发上限，默认 2
  --queue N  等待队列上限，默认 16
  --json     以 JSON 输出结果
  --help     显示本帮助，退出码 0

退出码: 0 全部成功  2 用法错误  3 输入不合 schema  4 池执行失败  130 中断`;

const int = (raw: string | undefined, name: string) => {
  if (raw === undefined) throw new UsageError(`缺少 ${name} 的取值`);
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) throw new UsageError(`${name} 必须是正整数，收到 ${raw}`);
  return value;
};

export function parseArgs(argv: readonly string[]): CliOptions | 'help' {
  const positional: string[] = [];
  let limit = 2;
  let queue = 16;
  let json = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') return 'help';
    else if (arg === '--json') json = true;
    else if (arg === '--limit') limit = int(argv[++i], '--limit');
    else if (arg === '--queue') queue = int(argv[++i], '--queue');
    else if (arg?.startsWith('-')) throw new UsageError(`未知参数 ${arg}`);
    else positional.push(String(arg));
  }
  const file = positional[0];
  if (file === undefined) throw new UsageError('缺少 jobs.json 路径');
  if (positional.length > 1) throw new UsageError(`多余的位置参数 ${positional.slice(1).join(' ')}`);
  return { file, limit, queue, json };
}

export function validateJobs(raw: unknown): Job[] {
  if (!Array.isArray(raw)) throw new SchemaError('顶层必须是数组');
  return raw.map((item: unknown, index) => {
    if (typeof item !== 'object' || item === null) throw new SchemaError(`第 ${index} 项不是对象`);
    const { id, ms } = item as Record<string, unknown>;
    if (typeof id !== 'string' || id.length === 0) throw new SchemaError(`第 ${index} 项 id 必须是非空字符串`);
    if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) throw new SchemaError(`第 ${index} 项 ms 必须是非负数`);
    return { id, ms };
  });
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function runJobs(
  jobs: readonly Job[],
  options: { limit: number; queue: number; signal?: AbortSignal },
): Promise<JobResult[]> {
  const pool = createPool(options.limit, options.queue);
  return Promise.all(jobs.map((job) => pool.run<JobResult>(async () => {
    if (options.signal?.aborted) return { id: job.id, status: 'cancelled' };
    await sleep(job.ms);
    if (options.signal?.aborted) return { id: job.id, status: 'cancelled' };
    return { id: job.id, status: 'ok', value: job.id.toUpperCase() };
  }).catch((error: unknown): JobResult => ({ id: job.id, status: 'error', error: error instanceof Error ? error.message : String(error) }))));
}

export async function main(argv: readonly string[]): Promise<number> {
  const controller = new AbortController();
  const onInterrupt = () => controller.abort();
  process.once('SIGINT', onInterrupt);
  try {
    const parsed = parseArgs(argv);
    if (parsed === 'help') {
      console.log(USAGE);
      return 0;
    }
    const text = await readFile(parsed.file, 'utf8');
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (error) {
      throw new SchemaError(`JSON 解析失败: ${error instanceof Error ? error.message : String(error)}`);
    }
    const jobs = validateJobs(raw);
    const results = await runJobs(jobs, { limit: parsed.limit, queue: parsed.queue, signal: controller.signal });
    const failed = results.some((r) => r.status === 'error');
    if (parsed.json) console.log(JSON.stringify({ results }, null, 2));
    else for (const r of results) console.log(`${r.id}\t${r.status}\t${r.value ?? r.error ?? ''}`);
    return controller.signal.aborted ? 130 : failed ? 4 : 0;
  } catch (error) {
    const code = error instanceof UsageError || error instanceof SchemaError ? error.code : 4;
    console.error(`ERROR ${error instanceof Error ? error.message : String(error)}`);
    if (code === 2) console.error(USAGE);
    return code;
  } finally {
    process.off('SIGINT', onInterrupt);
  }
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2));
