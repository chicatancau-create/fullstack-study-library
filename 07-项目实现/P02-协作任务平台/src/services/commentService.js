import { HttpError } from '../utils/errors.js';
import { assertTaskAccess } from '../policies/taskPolicy.js';

export async function addComment({ prisma, userId, taskId, body }) {
  await assertTaskAccess(prisma, taskId, userId);
  if (!body) throw new HttpError(400, 'body 必填', 'INVALID_INPUT');
  return prisma.comment.create({ data: { taskId, authorId: userId, body } });
}

export async function listComments({ prisma, userId, taskId }) {
  await assertTaskAccess(prisma, taskId, userId);
  return prisma.comment.findMany({ where: { taskId }, orderBy: { createdAt: 'asc' } });
}
