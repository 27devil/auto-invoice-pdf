/**
 * Structured JSON logging (spec §37, §77).
 *
 * Never pass access tokens, customer passwords, payment credentials, or
 * email-provider secrets into `context` — grep this file's callers if you're
 * ever unsure what's safe to log.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const configuredLevel = (process.env.LOG_LEVEL as LogLevel) || "info";

function shouldLog(level: LogLevel) {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[configuredLevel];
}

function emit(level: LogLevel, event: string, context: Record<string, unknown> = {}) {
  if (!shouldLog(level)) return;
  const entry = {
    level,
    event,
    timestamp: new Date().toISOString(),
    ...context,
  };
  const line = JSON.stringify(entry);
  if (level === "error") {
    // eslint-disable-next-line no-console
    console.error(line);
  } else if (level === "warn") {
    // eslint-disable-next-line no-console
    console.warn(line);
  } else {
    // eslint-disable-next-line no-console
    console.log(line);
  }
}

export const logger = {
  debug: (event: string, context?: Record<string, unknown>) => emit("debug", event, context),
  info: (event: string, context?: Record<string, unknown>) => emit("info", event, context),
  warn: (event: string, context?: Record<string, unknown>) => emit("warn", event, context),
  error: (event: string, context?: Record<string, unknown>) => emit("error", event, context),
};
