import prisma from "@/lib/prisma";
import type { PrismaClient, Prisma } from "@/lib/generated/prisma";

type TenantLike = {
  slug?: string | null;
  name?: string | null;
};

/**
 * CONTRACT: docs/contracts/CONTRATO DE TENANTS Y TEAMS (SERVICE-CLEANER).md
 * La heurística de tenant SERVICE vive solo aquí (migrable a futuro).
 */
export function isServiceTenant(tenant: TenantLike | null | undefined): boolean {
  if (!tenant) return false;
  const slug = tenant.slug ?? "";
  const name = tenant.name ?? "";
  return slug.startsWith("services-") || name.startsWith("Services -");
}

type DbClient = PrismaClient | Prisma.TransactionClient;

export async function assertServiceTenantById(tenantId: string, db: DbClient = prisma) {
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, slug: true, name: true },
  });
  if (!tenant || !isServiceTenant(tenant)) {
    throw new Error("Tenant no permitido para cleaners");
  }
  return tenant;
}

