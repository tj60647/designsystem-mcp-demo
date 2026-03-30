import { spawn } from "node:child_process";

const buildCommand = process.platform === "win32"
  ? { command: "cmd.exe", args: ["/d", "/s", "/c", "npm run build"] }
  : { command: "/bin/sh", args: ["-lc", "npm run build"] };

function exitFromChild(code, signal) {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
}

function startServer() {
  const env = {
    ...process.env,
    PORT: process.env.PORT ?? "3033",
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY ?? "test-key",
  };

  const server = spawn(process.execPath, ["dist/index.js"], {
    env,
    stdio: "inherit",
  });

  const forwardSignal = (signal) => {
    if (!server.killed) server.kill(signal);
  };

  process.on("SIGINT", () => forwardSignal("SIGINT"));
  process.on("SIGTERM", () => forwardSignal("SIGTERM"));

  server.on("error", (error) => {
    console.error("[playwright-webserver] failed to start app server", error);
    process.exit(1);
  });

  server.on("exit", (code, signal) => {
    exitFromChild(code, signal);
  });
}

const build = spawn(buildCommand.command, buildCommand.args, {
  env: process.env,
  stdio: "inherit",
});

build.on("error", (error) => {
  console.error("[playwright-webserver] build failed to start", error);
  process.exit(1);
});

build.on("exit", (code, signal) => {
  if (signal || code !== 0) {
    exitFromChild(code, signal);
    return;
  }
  startServer();
});