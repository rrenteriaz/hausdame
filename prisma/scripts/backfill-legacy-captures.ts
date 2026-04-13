// prisma/scripts/backfill-legacy-captures.ts
//
// FASE 2: Backfill de capturas para TaskJobStep legacy.
//
// CÓMO EJECUTAR (desde la raíz del proyecto):
//   npx tsx prisma/scripts/backfill-legacy-captures.ts
//
// QUÉ HACE:
//   1. Busca todos los TaskJobStep con snapshotVersion = "LEGACY_V1" y todas las captures en false
//   2. Para cada uno, revisa la respuesta y evidencia existente
//   3. Infiere capturas: boolValue → YesNo, numberValue → Number, textValue → Text, evidenceAssets → Photo
//   4. Steps sin datos inferibles quedan como "simple completion" (funcionan en el sheet)
//   5. Reporta un resumen al final
//
// SEGURIDAD:
//   - Solo toca registros LEGACY_V1 con todas las captures en false
//   - No elimina ni altera respuestas existentes
//   - Idempotente: puede ejecutarse múltiples veces sin daño

import { config } from "dotenv";
import { resolve } from "path";
import { existsSync } from "fs";
import { PrismaClient } from "../../lib/generated/prisma";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

// Cargar variables de entorno
const envPaths = [
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), ".env.local"),
  resolve(__dirname, "..", "..", ".env"),
  resolve(__dirname, "..", "..", ".env.local"),
];

let envLoaded = false;
for (const path of envPaths) {
  if (existsSync(path)) {
    const result = config({ path });
    if (!result.error) { envLoaded = true; break; }
  }
}
if (!envLoaded) config();

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL no está definida.");
  process.exit(1);
}

neonConfig.webSocketConstructor = ws;
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  console.log("=== Backfill Legacy Captures ===\n");

  const legacySteps = await prisma.taskJobStep.findMany({
    where: {
      snapshotVersion: "LEGACY_V1",
      capturesYesNoSnapshot: false,
      capturesNumberSnapshot: false,
      capturesPhotoSnapshot: false,
      capturesTextSnapshot: false,
    },
    include: {
      response: true,
      evidenceAssets: { where: { syncStatus: "UPLOADED" } },
    },
  });

  console.log(`Steps legacy sin capturas: ${legacySteps.length}`);

  let inferred = 0;
  let simpleComplete = 0;

  for (const step of legacySteps) {
    const r = step.response;
    const capturesYesNo = r !== null && r.boolValue !== null;
    const capturesNumber = r !== null && r.numberValue !== null;
    const capturesText = r !== null && !!(r.textValue);
    const capturesPhoto = step.evidenceAssets.length > 0;

    if (capturesYesNo || capturesNumber || capturesText || capturesPhoto) {
      await prisma.taskJobStep.update({
        where: { id: step.id },
        data: {
          capturesYesNoSnapshot: capturesYesNo,
          capturesNumberSnapshot: capturesNumber,
          capturesTextSnapshot: capturesText,
          capturesPhotoSnapshot: capturesPhoto,
          yesNoRequiredSnapshot: capturesYesNo && step.isRequiredSnapshot,
          numberRequiredSnapshot: capturesNumber && step.isRequiredSnapshot,
          textRequiredSnapshot: capturesText && step.isRequiredSnapshot,
          photoRequiredSnapshot: capturesPhoto && step.isRequiredSnapshot,
        },
      });

      const inferred_types = [
        capturesYesNo && "YesNo",
        capturesNumber && "Number",
        capturesText && "Text",
        capturesPhoto && `Photo(${step.evidenceAssets.length})`,
      ].filter(Boolean).join(", ");

      console.log(`  ✓ [INFERRED] "${step.nameSnapshot}" → ${inferred_types}`);
      inferred++;
    } else {
      simpleComplete++;
    }
  }

  console.log(`\n=== Resumen ===`);
  console.log(`  Total procesados:       ${legacySteps.length}`);
  console.log(`  Capturas inferidas:     ${inferred}`);
  console.log(`  Simple completion:      ${simpleComplete} (marcables como "completado" sin captura)`);
  console.log(`\nBackfill completado.`);
}

main()
  .catch((e) => { console.error("Error:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
