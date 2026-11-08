import { HttpError } from '../utils/errors.js';
import { assertMember } from '../policies/workspacePolicy.js';
import { assertTaskAccess } from '../policies/taskPolicy.js';

export const TASK_STATUSES = new Set(['todo', 'in_progress', 'done']);

function mapOwnerBusy(error, status) {
  if (error.code === 'P2002' && status === 'in_progress') {
    return new HttpError(409, '同一 Owner 已有进行中任务', 'OWNER_BUSY');
  }
  return error;
}

export async function createTask({ prisma, userId, workspaceId, title, ownerId = userId, status = 'todo' }) {
  await assertMember(prisma, userId, workspaceId);
  if (!title) throw new HttpError(400, 'title 必填', 'INVALID_INPUT');
  if (!TASK_STATUSES.has(status)) throw new HttpError(400, 'status 非法', 'INVALID_INPUT');
  await assertMember(prisma, ownerId, workspaceId);
  try {
    return await prisma.task.create({ data: { workspaceId, ownerId, title, status } });
  } catch (error) {
    throw mapOwnerBusy(error, status);
  }
}

export async function getTask({ prisma, userId, taskId }) {
  return assertTaskAccess(prisma, taskId, userId);
}

export async function listTasks({ prisma, userId, workspaceId }) {
  await assertMember(prisma, userId, workspaceId);
  return prisma.task.findMany({ where: { workspaceId }, orderBy: { createdAt: 'asc' } });
}

export async function updateTaskStatus({ prisma, userId, taskId, status }) {
  await assertTaskAccess(prisma, taskId, userId);
  if (!TASK_STATUSES.has(status)) throw new HttpError(400, 'status 非法', 'INVALID_INPUT');
  try {
    return await prisma.task.update({
      where: { id: taskId },
      data: { status, version: { increment: 1 } },
    });
  } catch (error) {
    throw mapOwnerBusy(error, status);
  }
}
