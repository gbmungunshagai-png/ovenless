import { lstat, readdir, rmdir, unlink } from "node:fs/promises";
import { join } from "node:path";

/** Delete a path without following symlinks (breaks symlink loops). */
async function rmNoFollow(path: string): Promise<void> {
  let stat;
  try {
    stat = await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }

  if (stat.isSymbolicLink()) {
    await unlink(path);
    return;
  }

  if (stat.isDirectory()) {
    for (const entry of await readdir(path)) {
      await rmNoFollow(join(path, entry));
    }
    await rmdir(path);
    return;
  }

  await unlink(path);
}

const target = process.argv[2];
if (!target) {
  console.error("Usage: bun rm-no-follow.ts <path>");
  process.exit(1);
}

await rmNoFollow(target);
console.log(`Removed ${target}`);
