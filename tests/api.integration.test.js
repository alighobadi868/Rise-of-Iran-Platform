import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

let child;
let baseUrl;
let tempDir;

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

before(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "rise-platform-test-"));
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ["server/index.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "test",
      HOST: "127.0.0.1",
      PORT: String(port),
      DATABASE_PATH: path.join(tempDir, "test.sqlite"),
      AI_ENABLED: "false",
      AI_API_KEY: "",
      AI_MODEL: ""
    },
    stdio: "ignore"
  });

  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Test server exited early with code ${child.exitCode}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ready) {
    child.kill("SIGTERM");
    throw new Error("Test server did not become ready within 6 seconds");
  }
});

after(async () => {
  if (child && child.exitCode === null) {
    child.kill("SIGTERM");
    await new Promise(resolve => {
      const timeout = setTimeout(resolve, 1500);
      child.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }
  if (tempDir) await fs.rm(tempDir, { recursive: true, force: true });
});

test("health endpoint reports database connectivity", async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.status, "ok");
  assert.equal(body.checks.database, "ok");
});

test("career guide accepts the real dashboard payload", async () => {
  const response = await fetch(`${baseUrl}/api/career/guide`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "municipal", concern: "insurance" })
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.match(body.answer, /بیمه|تأمین اجتماعی/);
  assert.ok(body.disclaimer);
});

test("contact form stores a valid, consented request", async () => {
  const response = await fetch(`${baseUrl}/api/contact`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Test User",
      email: "test@example.org",
      subject: "Integration test",
      message: "This is a test message with sufficient length.",
      consent: true
    })
  });
  const body = await response.json();
  assert.equal(response.status, 201);
  assert.equal(body.ok, true);
  assert.ok(body.id);
});

test("AI endpoint stays disabled without configured credentials", async () => {
  const status = await fetch(`${baseUrl}/api/ai/status`);
  const statusBody = await status.json();
  assert.equal(statusBody.enabled, false);

  const response = await fetch(`${baseUrl}/api/ai/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "Explain the platform's public purpose." })
  });
  assert.equal(response.status, 503);
});
