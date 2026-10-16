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
      AI_MODEL: "",
      CMS_ADMIN_PASSWORD: "test-admin-password",
      CMS_SESSION_SECRET: "test-session-secret"
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

test("account registration, profile review, and admin decision work end to end", async () => {
  const registration = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Sample Member", email: "member@example.org", password: "safe-test-password-123" })
  });
  const registrationBody = await registration.json();
  assert.equal(registration.status, 201);
  assert.equal(registrationBody.user.verificationStatus, "not_submitted");
  const memberCookie = registration.headers.get("set-cookie").split(";")[0];

  const submission = await fetch(`${baseUrl}/api/auth/verification`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: memberCookie },
    body: JSON.stringify({
      fullName: "Sample Member",
      organization: "Research",
      profileUrl: "https://example.org/profile",
      reason: "I would like to contribute research and public-policy analysis.",
      consent: true
    })
  });
  assert.equal(submission.status, 201);

  const adminLogin = await fetch(`${baseUrl}/api/cms/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "test-admin-password" })
  });
  assert.equal(adminLogin.status, 200);
  const adminCookie = adminLogin.headers.get("set-cookie").split(";")[0];

  const postForm = new FormData();
  postForm.append("title", "Test image post");
  postForm.append("body", "A small integration test post.");
  postForm.append("published", "on");
  postForm.append("media", new Blob(["sample image bytes"], { type: "image/png" }), "sample.png");
  const createPost = await fetch(`${baseUrl}/api/cms/posts`, { method: "POST", headers: { Cookie: adminCookie }, body: postForm });
  assert.equal(createPost.status, 201);
  const publicPosts = await fetch(`${baseUrl}/api/posts`);
  const publicPostBody = await publicPosts.json();
  assert.equal(publicPosts.status, 200);
  assert.equal(publicPostBody.posts.length, 1);
  const mediaResponse = await fetch(`${baseUrl}${publicPostBody.posts[0].media.url}`);
  assert.equal(mediaResponse.status, 200);
  assert.equal(mediaResponse.headers.get("content-type"), "image/png");
  assert.equal(await mediaResponse.text(), "sample image bytes");

  const requests = await fetch(`${baseUrl}/api/cms/verification-requests`, { headers: { Cookie: adminCookie } });
  const requestBody = await requests.json();
  assert.equal(requests.status, 200);
  assert.equal(requestBody.requests.length, 1);
  const requestId = requestBody.requests[0].id;

  const decision = await fetch(`${baseUrl}/api/cms/verification-requests/${requestId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({ status: "approved", adminNote: "Profile reviewed in test." })
  });
  assert.equal(decision.status, 200);

  const status = await fetch(`${baseUrl}/api/auth/status`, { headers: { Cookie: memberCookie } });
  const statusBody = await status.json();
  assert.equal(statusBody.user.verificationStatus, "verified");
});


test("channel manager persists drafts and refuses false success without Telegram credentials", async () => {
  const login = await fetch(`${baseUrl}/api/cms/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "test-admin-password" })
  });
  assert.equal(login.status, 200);
  const adminCookie = login.headers.get("set-cookie").split(";")[0];

  const connection = await fetch(`${baseUrl}/api/cms/channels/status`, { headers: { Cookie: adminCookie } });
  const connectionBody = await connection.json();
  assert.equal(connection.status, 200);
  assert.equal(connectionBody.configured, false);
  assert.equal(connectionBody.connected, false);

  const create = await fetch(`${baseUrl}/api/cms/channels/posts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({ title: "Channel draft", content: "A real channel-manager draft.", mediaUrl: "", mediaType: "none", scheduledAt: "" })
  });
  const created = await create.json();
  assert.equal(create.status, 201);
  assert.ok(created.id);

  const publish = await fetch(`${baseUrl}/api/cms/channels/posts/${created.id}/publish`, {
    method: "POST",
    headers: { Cookie: adminCookie }
  });
  const publishBody = await publish.json();
  assert.equal(publish.status, 503);
  assert.match(publishBody.message, /پیکربندی نشده/);

  const list = await fetch(`${baseUrl}/api/cms/channels/posts`, { headers: { Cookie: adminCookie } });
  const listBody = await list.json();
  assert.equal(list.status, 200);
  assert.ok(listBody.posts.some(post => post.id === created.id && post.status === "draft"));

  const remove = await fetch(`${baseUrl}/api/cms/channels/posts/${created.id}`, {
    method: "DELETE",
    headers: { Cookie: adminCookie }
  });
  assert.equal(remove.status, 200);
});
