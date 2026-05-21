export function isMissingPrismaSchemaError(error: unknown) {
  const prismaError = error as { code?: unknown; message?: unknown };
  const message = typeof prismaError.message === "string" ? prismaError.message : "";

  return (
    prismaError.code === "P2021" ||
    prismaError.code === "P2022" ||
    message.includes("does not exist") ||
    message.includes("Unknown column") ||
    message.includes("Unknown field")
  );
}
