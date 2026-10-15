import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

function attributeNames(tag) {
  const names = [];
  let i = tag.indexOf(" ") + 1;
  if (i <= 0) return names;
  while (i < tag.length - 1) {
    while (i < tag.length && (/[\s/>]/.test(tag[i]))) i += 1;
    if (i >= tag.length - 1) break;
    const start = i;
    while (i < tag.length && !/[\s=/>]/.test(tag[i])) i += 1;
    if (i === start) {
      i += 1;
      continue;
    }
    names.push(tag.slice(start, i).toLowerCase());
    while (i < tag.length && /\s/.test(tag[i])) i += 1;
    if (tag[i] !== "=") continue;
    i += 1;
    while (i < tag.length && /\s/.test(tag[i])) i += 1;
    const quote = tag[i] === '"' || tag[i] === "'" ? tag[i] : null;
    if (quote) {
      i += 1;
      while (i < tag.length && tag[i] !== quote) i += 1;
      if (tag[i] === quote) i += 1;
    } else {
      while (i < tag.length && !/[\s>]/.test(tag[i])) i += 1;
    }
  }
  return names;
}

test("public HTML has no duplicate attributes on opening tags", async () => {
  const directory = path.join(process.cwd(), "public");
  const files = (await fs.readdir(directory)).filter(name => name.endsWith(".html"));
  const issues = [];
  for (const file of files) {
    const html = await fs.readFile(path.join(directory, file), "utf8");
    const tags = html.match(/<[A-Za-z][^<>]*>/g) || [];
    for (const tag of tags) {
      const names = attributeNames(tag);
      const duplicates = [...new Set(names.filter((name, index) => names.indexOf(name) !== index))];
      if (duplicates.length) issues.push(`${file}: ${duplicates.join(", ")} in ${tag.slice(0, 180)}`);
    }
  }
  assert.deepEqual(issues, [], issues.join("\n"));
});
