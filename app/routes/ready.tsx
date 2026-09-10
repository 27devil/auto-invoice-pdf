import prisma from "../db.server";

/** Readiness probe (spec §76): can this instance actually serve traffic. */
export const loader = async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return new Response("ready", { status: 200 });
  } catch {
    return new Response("database unavailable", { status: 503 });
  }
};
