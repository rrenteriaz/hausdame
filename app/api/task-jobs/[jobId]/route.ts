// app/api/task-jobs/[jobId]/route.ts
// GET: Detalle completo del job (secciones + pasos + respuestas + evidencias)
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import prisma from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const user = await getCurrentUser();
  if (!user || !user.tenantId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { jobId } = await params;

  const job = await prisma.taskJob.findFirst({
    where: { id: jobId, tenantId: user.tenantId },
    include: {
      property: { select: { name: true, shortName: true } },
      assignedUser: { select: { id: true, name: true } },
      sections: {
        orderBy: { order: "asc" },
        include: {
          response: true,
          evidenceAssets: true,
          steps: {
            orderBy: { order: "asc" },
            include: {
              response: true,
              evidenceAssets: true,
            },
          },
        },
      },
    },
  });

  if (!job) {
    return NextResponse.json({ error: "Job no encontrado" }, { status: 404 });
  }

  return NextResponse.json({ job });
}
