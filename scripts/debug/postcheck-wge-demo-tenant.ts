// scripts/debug/postcheck-wge-demo-tenant.ts
import "dotenv/config";
import { PrismaClient } from "../../lib/generated/prisma";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws as any;

const TENANT_ID = "cmkreziw50000boo7oi3t9cuc";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL missing");
    process.exit(1);
  }

  const prisma = new PrismaClient({
    adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
    log: ["error"],
  });

  try {
    const wgeServices = await prisma.workGroupExecutor.count({
      where: { servicesTenantId: TENANT_ID },
    });

    const wgeHost = await prisma.workGroupExecutor.count({
      where: { hostTenantId: TENANT_ID },
    });

    console.log("WGE servicesTenantId count:", wgeServices);
    console.log("WGE hostTenantId count:", wgeHost);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
