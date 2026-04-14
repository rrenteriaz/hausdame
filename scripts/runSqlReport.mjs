import fs from "fs";
import dotenv from "dotenv";
import { PrismaClient } from "../lib/generated/prisma";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

if (fs.existsSync(".env.local")) {
  dotenv.config({ path: ".env.local" });
} else if (fs.existsSync(".env")) {
  dotenv.config({ path: ".env" });
}

if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === "") {
  console.error("❌ Error: DATABASE_URL no está definido.");
  process.exit(1);
}

try {
  neonConfig.webSocketConstructor = ws;
} catch (error) {
  console.warn("Error configurando WebSocket para Neon:", error);
}

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter, log: ["error", "warn"] });

function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index !== -1) return process.argv[index + 1] || null;
  const withEquals = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  if (!withEquals) return null;
  return withEquals.split("=").slice(1).join("=") || null;
}

function stripLineComments(sql) {
  return sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
}

function splitStatements(sql) {
  const withoutComments = stripLineComments(sql);
  return withoutComments
    .split(";")
    .map((stmt) => stmt.trim())
    .filter((stmt) => stmt.length > 0);
}

function isReadStatement(stmt) {
  const normalized = stmt.trim().toLowerCase();
  return (
    normalized.startsWith("select") ||
    normalized.startsWith("with") ||
    normalized.startsWith("show")
  );
}

async function main() {
  const filePath = getArgValue("--file");
  if (!filePath) {
    console.error("Uso: node scripts/runSqlReport.mjs --file <path>");
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    console.error(`Archivo no encontrado: ${filePath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(filePath, "utf8");
  const statements = splitStatements(sql);

  if (statements.length === 0) {
    console.error("No se encontraron statements en el archivo.");
    process.exit(1);
  }

  for (let i = 0; i < statements.length; i += 1) {
    const statement = statements[i];
    const stmtNumber = i + 1;

    console.log(`--- STATEMENT #${stmtNumber} ---`);

    try {
      if (isReadStatement(statement)) {
        const rows = await prisma.$queryRawUnsafe(statement);
        const count = Array.isArray(rows) ? rows.length : 0;
        console.log(`Rows: ${count}`);
        if (Array.isArray(rows)) {
          try {
            console.table(rows);
          } catch {
            console.log(JSON.stringify(rows, null, 2));
          }
        } else {
          console.log(JSON.stringify(rows, null, 2));
        }
      } else {
        const result = await prisma.$executeRawUnsafe(statement);
        console.log(`Executed. rowsAffected: ${result}`);
      }
    } catch (error) {
      console.error("Error ejecutando statement:");
      console.error(statement);
      console.error(error?.message || error);
      process.exitCode = 1;
      break;
    }
  }
}

main()
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

