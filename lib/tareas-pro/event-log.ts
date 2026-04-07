// lib/tareas-pro/event-log.ts
import prisma from "@/lib/prisma";
import { TaskEventLogType } from "@prisma/client";

export async function logTaskEvent({
  tenantId,
  jobId,
  eventType,
  actorId,
  metadata,
}: {
  tenantId: string;
  jobId: string;
  eventType: TaskEventLogType;
  actorId?: string;
  metadata?: Record<string, unknown>;
}) {
  await prisma.taskJobEventLog.create({
    data: {
      tenantId,
      jobId,
      eventType,
      actorId,
      metadata: (metadata ?? undefined) as any,
    },
  });
}
