import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// ── Enforcement de arquitectura de tiempo y zonas horarias ───────────────────
//
// Estos patrones han causado bugs silenciosos en producción cuando el servidor
// Node.js no corre en UTC o cuando el código se ejecuta en una TZ diferente a CDMX.
//
// Excepciones legítimas (archivos del módulo oficial de tiempo):
//   - lib/datetime/cdmxToday.ts   → implementación de los helpers centrales
//   - lib/datetime/buildCleaningScheduledDate.ts → usa ISO strings con offset
//
// Para cualquier otro archivo: importa desde @/lib/time en vez de manipular Date directamente.
const timeSafetyRules = {
  // Prohíbe new Date("YYYY-MM-DD") — JS lo parsea como UTC midnight, no como local.
  // Usa buildCleaningScheduledDate() o getStartOfCdmxDay() según el caso.
  "no-restricted-syntax": [
    "warn",
    {
      selector: "CallExpression[callee.name='Date'][arguments.0.type='Literal'][arguments.0.value=/^\\d{4}-\\d{2}-\\d{2}$/]",
      message:
        "new Date('YYYY-MM-DD') es ambiguo (UTC vs local). Usa buildCleaningScheduledDate() o Date.UTC().",
    },
    {
      selector: "CallExpression[callee.object.name='Date'][callee.property.name='parse'][arguments.0.type='Literal'][arguments.0.value=/^\\d{4}-\\d{2}-\\d{2}/]",
      message:
        "Date.parse('YYYY-MM-DD') es ambiguo. Usa Date.UTC() o buildCleaningScheduledDate().",
    },
    {
      // setHours() fuera del módulo oficial de tiempo
      selector: "CallExpression[callee.property.name='setHours']",
      message:
        "setHours() usa la TZ del proceso Node. Usa getStartOfCdmxToday() / getStartOfCdmxDay() de @/lib/time.",
    },
    {
      // setDate() fuera del módulo oficial de tiempo
      selector: "CallExpression[callee.property.name='setDate']",
      message:
        "setDate() usa la TZ del proceso Node. Usa getStartOfCdmxDay(new Date(Date.now() - N * 86_400_000)) de @/lib/time.",
    },
  ],
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // El módulo oficial de tiempo puede usar patrones Date internamente:
    "lib/datetime/**",
  ]),
  // Aplicar reglas de tiempo a todo el código de la app (excluye node_modules y lib/datetime por el ignore global).
  {
    files: ["app/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}", "scripts/**/*.ts"],
    rules: timeSafetyRules,
  },
]);

export default eslintConfig;
