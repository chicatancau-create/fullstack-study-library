CREATE TYPE "Role" AS ENUM ('owner', 'admin', 'member');
CREATE TYPE "TaskStatus" AS ENUM ('todo', 'in_progress', 'done');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE TABLE "RefreshToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

CREATE TABLE "Workspace" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Membership" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "Role" NOT NULL DEFAULT 'member',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Membership_workspaceId_userId_key" ON "Membership"("workspaceId", "userId");

CREATE TABLE "Task" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "status" "TaskStatus" NOT NULL DEFAULT 'todo',
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Task_workspaceId_status_idx" ON "Task"("workspaceId", "status");

CREATE TABLE "Comment" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Comment_taskId_idx" ON "Comment"("taskId");

ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 同一工作区同一 Owner 同时只能有一个进行中任务；并发插入由数据库裁决。
CREATE UNIQUE INDEX "Task_one_in_progress_per_owner"
  ON "Task"("workspaceId", "ownerId")
  WHERE "status" = 'in_progress';
