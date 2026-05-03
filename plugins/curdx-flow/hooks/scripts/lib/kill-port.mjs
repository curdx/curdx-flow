import { createRequire as __ccr } from 'node:module';
import { fileURLToPath as __ccu } from 'node:url';
import { dirname as __ccd } from 'node:path';
const require = __ccr(import.meta.url);
const __filename = __ccu(import.meta.url);
const __dirname = __ccd(__filename);

// src/hooks/lib/kill-port.ts
import { execFileSync } from "node:child_process";
function tryExec(cmd, args) {
  try {
    const stdout = execFileSync(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8"
    });
    return { stdout, ok: true };
  } catch {
    return { stdout: "", ok: false };
  }
}
function findPidsPosix(port) {
  const res = tryExec("lsof", ["-ti", `:${port}`]);
  return res.stdout.split(/\r?\n/).map((s) => s.trim()).filter((s) => s.length > 0 && /^\d+$/.test(s));
}
function findPidsWindows(port) {
  const res = tryExec("netstat", ["-ano"]);
  if (!res.stdout) return [];
  const needle = `:${port}`;
  const pids = /* @__PURE__ */ new Set();
  for (const line of res.stdout.split(/\r?\n/)) {
    if (!line.includes(needle)) continue;
    const cols = line.trim().split(/\s+/);
    const pid = cols[cols.length - 1];
    if (pid && /^\d+$/.test(pid)) {
      pids.add(pid);
    }
  }
  return [...pids];
}
function killPosix(pid) {
  try {
    execFileSync("kill", [pid], { stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch (err) {
    process.stderr.write(
      `kill-port: failed to kill pid ${pid}: ${err.message}
`
    );
    return false;
  }
}
function killWindows(pid) {
  try {
    execFileSync("taskkill", ["/F", "/PID", pid], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    return true;
  } catch (err) {
    process.stderr.write(
      `kill-port: failed to kill pid ${pid}: ${err.message}
`
    );
    return false;
  }
}
function main() {
  const args = process.argv.slice(2);
  const portArg = args[0];
  if (portArg === void 0) {
    process.stderr.write("usage: kill-port <port>\n");
    process.exit(1);
  }
  const port = Number.parseInt(portArg, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    process.stderr.write(
      `kill-port: invalid port "${portArg}" (must be integer 1..65535)
`
    );
    process.exit(1);
  }
  const isWindows = process.platform === "win32";
  const pids = isWindows ? findPidsWindows(port) : findPidsPosix(port);
  if (pids.length === 0) {
    process.stdout.write(`kill-port: no listeners on port ${port}
`);
    process.exit(0);
  }
  let killed = 0;
  for (const pid of pids) {
    const ok = isWindows ? killWindows(pid) : killPosix(pid);
    if (ok) killed += 1;
  }
  process.stdout.write(
    `kill-port: killed ${killed}/${pids.length} pid(s) on port ${port}
`
  );
  process.exit(0);
}
main();
//# sourceMappingURL=kill-port.mjs.map
