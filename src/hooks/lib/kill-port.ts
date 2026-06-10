import { execFileSync } from "node:child_process";

interface ExecResult {
  stdout: string;
  ok: boolean;
}

function tryExec(cmd: string, args: string[]): ExecResult {
  try {
    const stdout = execFileSync(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
    });
    return { stdout, ok: true };
  } catch {
    // non-zero exit (e.g. lsof returns 1 when no matches) — treat as empty
    return { stdout: "", ok: false };
  }
}

function findPidsPosix(port: number): string[] {
  const res = tryExec("lsof", ["-ti", `:${port}`]);
  return res.stdout
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && /^\d+$/.test(s));
}

function findPidsWindows(port: number): string[] {
  const res = tryExec("netstat", ["-ano"]);
  if (!res.stdout) return [];
  const needle = `:${port}`;
  const pids = new Set<string>();
  for (const line of res.stdout.split(/\r?\n/)) {
    if (!line.includes(needle)) continue;
    // netstat -ano columns: Proto LocalAddr ForeignAddr State PID
    const cols = line.trim().split(/\s+/);
    const pid = cols[cols.length - 1];
    if (pid && /^\d+$/.test(pid)) {
      pids.add(pid);
    }
  }
  return [...pids];
}

function killPosix(pid: string): boolean {
  try {
    execFileSync("kill", [pid], { stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch (err) {
    process.stderr.write(
      `kill-port: failed to kill pid ${pid}: ${(err as Error).message}\n`,
    );
    return false;
  }
}

function killWindows(pid: string): boolean {
  try {
    execFileSync("taskkill", ["/F", "/PID", pid], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    return true;
  } catch (err) {
    process.stderr.write(
      `kill-port: failed to kill pid ${pid}: ${(err as Error).message}\n`,
    );
    return false;
  }
}

function main(): void {
  const args = process.argv.slice(2);
  const portArg = args[0];
  if (portArg === undefined) {
    process.stderr.write("usage: kill-port <port>\n");
    process.exit(1);
  }

  const port = Number.parseInt(portArg, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    process.stderr.write(
      `kill-port: invalid port "${portArg}" (must be integer 1..65535)\n`,
    );
    process.exit(1);
  }

  const isWindows = process.platform === "win32";
  const pids = isWindows ? findPidsWindows(port) : findPidsPosix(port);

  if (pids.length === 0) {
    process.stdout.write(`kill-port: no listeners on port ${port}\n`);
    process.exit(0);
  }

  let killed = 0;
  for (const pid of pids) {
    const ok = isWindows ? killWindows(pid) : killPosix(pid);
    if (ok) killed += 1;
  }

  process.stdout.write(
    `kill-port: killed ${killed}/${pids.length} pid(s) on port ${port}\n`,
  );
  process.exit(0);
}

main();
