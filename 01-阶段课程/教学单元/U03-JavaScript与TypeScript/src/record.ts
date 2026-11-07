export type StudyRecord = {
  id: string;
  title: string;
  minutes: number;
  tags: readonly string[];
};

export class ValidationError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 运行时边界：外部数据先当 unknown，逐字段收窄；不用 any，也不信任断言。
 */
export function parseRecord(input: unknown): StudyRecord {
  if (!isObject(input)) throw new ValidationError('root', '记录必须是对象');

  const id = input.id;
  if (typeof id !== 'string' || id.trim() === '') {
    throw new ValidationError('id', 'id 必须是非空字符串');
  }

  const title = input.title;
  if (typeof title !== 'string' || title.trim().length < 1 || title.length > 60) {
    throw new ValidationError('title', 'title 必须是 1–60 字符');
  }

  const minutes = input.minutes;
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes < 0) {
    throw new ValidationError('minutes', 'minutes 必须是 >=0 的有限数');
  }

  const rawTags = input.tags ?? [];
  if (!Array.isArray(rawTags) || rawTags.some((tag) => typeof tag !== 'string')) {
    throw new ValidationError('tags', 'tags 必须是字符串数组');
  }

  return { id, title, minutes, tags: [...rawTags] };
}

export function totalMinutes(records: readonly StudyRecord[]): number {
  return records.reduce((sum, record) => sum + record.minutes, 0);
}