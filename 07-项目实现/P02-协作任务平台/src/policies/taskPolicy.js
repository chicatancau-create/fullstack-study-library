import { HttpError } from '../utils/errors.js';
import { assertMember } from './workspacePolicy.js';

export async function loadTask(prisma, taskId) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new HttpError(404, '任务不存在', 'NOT_FOUND');
  return task;
}

export async function assertTaskAccess(prisma, taskId, userId) {
  const task = await loadTask(prisma, taskId);
  await assertMember(prisma, userId, task.workspaceId);
  return task;
}

export function canComment() {
  return true;
}

export function canUpdateStatus() {
  return true;
}
