import test from "node:test";
import assert from "node:assert/strict";

test("contact schema requires consent and valid core fields", async () => {
  const { z } = await import("zod");
  const schema = z.object({
    name: z.string().trim().min(2).max(100),
    email: z.string().trim().email().max(254),
    subject: z.string().trim().min(3).max(160),
    message: z.string().trim().min(10).max(5000),
    consent: z.literal(true)
  }).strict();
  const valid = { name: "Example Person", email: "person@example.org", subject: "Project question", message: "I would like to ask about your research plans.", consent: true };
  assert.equal(schema.safeParse(valid).success, true);
  assert.equal(schema.safeParse({ ...valid, consent: false }).success, false);
  assert.equal(schema.safeParse({ ...valid, email: "not-an-email" }).success, false);
  assert.equal(schema.safeParse({ ...valid, message: "short" }).success, false);
  assert.equal(schema.safeParse({ ...valid, unexpected: "field" }).success, false);
});
