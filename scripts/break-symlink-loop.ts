import { lstat, rm } from "node:fs/promises";
import { join, normalize } from "node:path";

const root = process.argv[2] ?? "C:\\projects\\test\\scaffold-test";
const cycle = ["tests", "fixtures", "example-app", "node_modules", "ovenless"] as const;

function winPath(path: string): string {
  const normalized = normalize(path);
  return normalized.startsWith("\\\\?\\") ? normalized : `\\\\?\\${normalized}`;
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(winPath(path));
    return true;
  } catch {
    return false;
  }
}

async function findDeepestOvenless(start: string): Promise<string> {
  let current = start;
  for (;;) {
    const next = join(current, ...cycle);
    if (!(await exists(next))) break;
    current = next;
  }
  return current;
}

console.log(`Breaking install loop under ${root}...`);

const top = join(root, "node_modules", "ovenless");
let passes = 0;

while ((await exists(top)) && (await exists(join(await findDeepestOvenless(top), "tests")))) {
  const deepest = await findDeepestOvenless(top);
  const testsPath = join(deepest, "tests");
  await rm(winPath(testsPath), { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  passes++;
  console.log(`  pass ${passes}: removed tests at depth ${passes}`);
}

if (await exists(root)) {
  await rm(winPath(root), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

console.log(passes > 0 ? `Done after ${passes} pass(es).` : "Done.");
