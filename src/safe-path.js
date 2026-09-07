import { randomBytes } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

export function assertNoSymlinkComponents(cwd, target, { includeLeaf = true } = {}) {
  const root = path.resolve(cwd);
  const resolved = path.resolve(target);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to access a path outside the application: ${target}`);
  }
  const parts = relative.split(path.sep).filter(Boolean);
  let cursor = root;
  const limit = includeLeaf ? parts.length : Math.max(0, parts.length - 1);
  for (let index = 0; index < limit; index += 1) {
    cursor = path.join(cursor, parts[index]);
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) {
      throw new Error(`Refusing to access a path through symbolic link: ${cursor}`);
    }
  }
}

export function atomicWriteFile(cwd, file, contents, { mode = 0o600 } = {}) {
  assertNoSymlinkComponents(cwd, file);
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  assertNoSymlinkComponents(cwd, file);
  const temporary = `${file}.namoid-${process.pid}-${randomBytes(8).toString("hex")}`;
  try {
    writeFileSync(temporary, contents, { mode, flag: "wx" });
    renameSync(temporary, file);
  } finally {
    if (existsSync(temporary)) rmSync(temporary, { force: true });
  }
}
