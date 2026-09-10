/** Liveness probe (spec §76). Unauthenticated, no DB/Redis access — just "is the process up". */
export const loader = async () => new Response("ok", { status: 200 });
