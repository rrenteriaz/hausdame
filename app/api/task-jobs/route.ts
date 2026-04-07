// app/api/task-jobs/route.ts
// GET: Listar jobs accesibles para el usuario autenticado
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !user.tenantId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const propertyId = searchParams.get("propertyId") ?? undefined;
  const status = searchParams.get("status") ?? undefined;

  const where: Record<string, unknown> = { tenantId: user.tenantId };
  if (propertyId) where.propertyId = propertyId;
  if (status) where.status = status;

  // Cleaners solo ven los jobs asignados a ellos o sin asignar de su propiedad
  if (user.role === "CLEANER") {
    where.assignedUserId = user.id;
  }

  const jobs = await prisma.taskJob.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      occurrenceKey: true,
      templateNameSnapshot: true,
      propertyId: true,
      assignedUserId: true,
      startedAt: true,
      completedAt: true,
      deferredAt: true,
      createdAt: true,
      property: { select: { name: true, shortName: true } },
    },
  });

  return NextResponse.json({ jobs });
}
