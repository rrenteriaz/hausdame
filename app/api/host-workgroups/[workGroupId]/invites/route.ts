// app/api/host-workgroups/[workGroupId]/invites/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getInviteLink, getInviteRequestBaseUrl } from "@/lib/invites/links";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { getDefaultTenant } from "@/lib/tenant";
import { randomBytes } from "crypto";

/**
 * Genera un token seguro para invitaciones (mínimo 32 caracteres)
 */
function generateSecureToken(): string {
  // Generar 32 bytes aleatorios y convertir a base64url (sin padding)
  const bytes = randomBytes(32);
  return bytes.toString("base64url");
}

async function readJsonBody(req: NextRequest): Promise<Record<string, unknown>> {
  const rawBody = await req.text();
  if (!rawBody.trim()) return {};

  try {
    const parsed = JSON.parse(rawBody);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * POST /api/host-workgroups/[workGroupId]/invites
 * Crea una nueva invitación para un WorkGroup
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workGroupId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { workGroupId } = await params;
    const tenant = await getDefaultTenant();
    if (!tenant) {
      return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
    }

    const body = await readJsonBody(req);
    const prefillName =
      typeof body.prefillName === "string" ? body.prefillName : null;
    const expiresInDays =
      typeof body.expiresInDays === "number" ||
      typeof body.expiresInDays === "string"
        ? body.expiresInDays
        : 7;

    // Validar que el WorkGroup existe y pertenece al tenant
    const workGroup = await prisma.hostWorkGroup.findFirst({
      where: {
        id: workGroupId,
        tenantId: tenant.id,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!workGroup) {
      return NextResponse.json({ error: "Grupo de trabajo no encontrado" }, { status: 404 });
    }

    // Validar y clamp expiresInDays
    const days = Math.max(1, Math.min(30, Number.parseInt(String(expiresInDays)) || 7));

    // Generar token seguro
    let token: string;
    let attempts = 0;
    const maxAttempts = 5;

    do {
      token = generateSecureToken();
      const existing = await prisma.hostWorkGroupInvite.findUnique({
        where: { token },
      });
      if (!existing) break;
      attempts++;
    } while (attempts < maxAttempts);

    if (attempts >= maxAttempts) {
      return NextResponse.json(
        { error: "Error al generar token único. Intenta nuevamente." },
        { status: 500 }
      );
    }

    // Calcular fecha de expiración
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);

    const trimmedPrefill = prefillName?.trim() || null;

    // Crear invite
    const invite = await prisma.hostWorkGroupInvite.create({
      data: {
        tenantId: tenant.id,
        workGroupId,
        token,
        status: "PENDING",
        createdByUserId: user.id,
        prefillName: trimmedPrefill ?? undefined,
        message: null, // No se usa mensaje personalizado (igual que TL→SM)
        expiresAt,
      },
    });

    // Construir link usando el origin real del navegador/request.
    const requestBaseUrl = getInviteRequestBaseUrl(req.headers, req.nextUrl.origin);
    const inviteLink = getInviteLink(token, "workgroup", requestBaseUrl);

    return NextResponse.json({
      ok: true,
      invite: {
        id: invite.id,
        status: invite.status,
        expiresAt: invite.expiresAt.toISOString(),
        token: invite.token,
      },
      inviteLink,
    });
  } catch (error) {
    console.error("Error creando invite:", error);
    const message =
      error instanceof Error ? error.message : "Error al crear invitación";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

