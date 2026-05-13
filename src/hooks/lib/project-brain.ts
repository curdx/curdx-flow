// src/hooks/lib/project-brain.ts
//
// Lightweight project-local memory for curdx-flow runtime decisions.
// Stored under .curdx/ so it is ignored by git and never written into the
// plugin installation directory.

import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export type BrainEventType =
  | "route-compiled"
  | "edit-batch"
  | "verification-run"
  | "verification-blocked"
  | "last-mile-decision";

export interface BrainEvent {
  version: 1;
  type: BrainEventType;
  timestamp: string;
  route?: string;
  stack?: string;
  phase?: string;
  command?: string;
  exitCode?: number;
  verifier?: string;
  reason?: string;
  files?: number;
}

export interface BrainWriteResult {
  ok: boolean;
  path: string;
  error?: string;
}

export interface BrainSummary {
  path: string;
  exists: boolean;
  totalEvents: number;
  lastUpdated: string | null;
  stackHints: string[];
  verifierHints: string[];
  recentFailures: Array<{
    timestamp: string;
    type: BrainEventType;
    phase?: string;
    command?: string;
    reason?: string;
  }>;
}

const MAX_REASON = 240;
const MAX_COMMAND = 180;
const MAX_BRAIN_BYTES = 64 * 1024;
const MAX_BRAIN_LINES = 400;

function normalizeCwd(cwd?: string): string {
  return resolve(cwd ?? process.cwd());
}

export function brainPath(cwd?: string): string {
  return join(normalizeCwd(cwd), ".curdx", "brain.jsonl");
}

function truncate(value: string | undefined, limit: number): string | undefined {
  if (value === undefined) return undefined;
  const compact = value.trim().replace(/\s+/g, " ");
  if (compact.length <= limit) return compact;
  return `${compact.slice(0, Math.max(0, limit - 3))}...`;
}

function normalizeEvent(event: Omit<BrainEvent, "version" | "timestamp">): BrainEvent {
  const out: BrainEvent = {
    version: 1,
    type: event.type,
    timestamp: new Date().toISOString(),
  };
  if (event.route) out.route = event.route;
  if (event.stack) out.stack = event.stack;
  if (event.phase) out.phase = event.phase;
  if (event.command) out.command = truncate(event.command, MAX_COMMAND);
  if (typeof event.exitCode === "number" && Number.isFinite(event.exitCode)) {
    out.exitCode = event.exitCode;
  }
  if (event.verifier) out.verifier = truncate(event.verifier, MAX_COMMAND);
  if (event.reason) out.reason = truncate(event.reason, MAX_REASON);
  if (typeof event.files === "number" && Number.isFinite(event.files)) {
    out.files = Math.max(0, Math.floor(event.files));
  }
  return out;
}

export function appendBrainEvent(
  cwd: string | undefined,
  event: Omit<BrainEvent, "version" | "timestamp">,
): BrainWriteResult {
  const path = brainPath(cwd);
  if (process.env.CURDX_FLOW_BRAIN === "off") return { ok: true, path };
  try {
    mkdirSync(join(normalizeCwd(cwd), ".curdx"), { recursive: true });
    appendFileSync(path, JSON.stringify(normalizeEvent(event)) + "\n", "utf8");
    compactBrainIfNeeded(path);
    return { ok: true, path };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, path, error: message };
  }
}

function compactBrainIfNeeded(path: string): void {
  try {
    if (statSync(path).size <= MAX_BRAIN_BYTES) return;
    const lines = readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-MAX_BRAIN_LINES);
    writeFileSync(path, lines.join("\n") + (lines.length > 0 ? "\n" : ""), "utf8");
  } catch {
    // Brain is advisory; never fail the caller because compaction failed.
  }
}

function parseBrainLine(line: string): BrainEvent | null {
  try {
    const parsed = JSON.parse(line) as Partial<BrainEvent>;
    if (parsed.version !== 1) return null;
    if (
      parsed.type !== "route-compiled" &&
      parsed.type !== "edit-batch" &&
      parsed.type !== "verification-run" &&
      parsed.type !== "verification-blocked" &&
      parsed.type !== "last-mile-decision"
    ) {
      return null;
    }
    if (typeof parsed.timestamp !== "string") return null;
    return parsed as BrainEvent;
  } catch {
    return null;
  }
}

export function readBrainEvents(cwd?: string, limit = 100): BrainEvent[] {
  const path = brainPath(cwd);
  if (!existsSync(path)) return [];
  try {
    const lines = readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const parsed = lines
      .slice(Math.max(0, lines.length - Math.max(1, limit)))
      .map(parseBrainLine)
      .filter((event): event is BrainEvent => event !== null);
    return parsed;
  } catch {
    return [];
  }
}

function uniqueRecent(values: Array<string | undefined>, limit: number): string[] {
  const out: string[] = [];
  for (const value of values.reverse()) {
    if (!value || out.includes(value)) continue;
    out.push(value);
    if (out.length >= limit) break;
  }
  return out;
}

export function summarizeProjectBrain(cwd?: string): BrainSummary {
  const path = brainPath(cwd);
  const events = readBrainEvents(cwd, 200);
  const failures = events
    .filter((event) => event.type === "verification-blocked" || event.exitCode !== undefined && event.exitCode !== 0)
    .slice(-5)
    .reverse()
    .map((event) => ({
      timestamp: event.timestamp,
      type: event.type,
      phase: event.phase,
      command: event.command,
      reason: event.reason,
    }));
  const verifierHints = uniqueRecent(
    events
      .filter((event) => event.type === "verification-run" && event.exitCode === 0)
      .map((event) => event.command ?? event.verifier),
    5,
  );

  return {
    path,
    exists: existsSync(path),
    totalEvents: events.length,
    lastUpdated: events.length > 0 ? events[events.length - 1]?.timestamp ?? null : null,
    stackHints: uniqueRecent(events.map((event) => event.stack), 5),
    verifierHints,
    recentFailures: failures,
  };
}
