import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

// Only log errors — verbose query/warn logging adds measurable latency in dev
export const prisma = globalThis.prisma ?? new PrismaClient({ log: ["error"] });

if (process.env.NODE_ENV !== "production") globalThis.prisma = prisma;
