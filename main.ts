// Out of Tokens, Mid-Sentence — entrypoint
// Writes exactly one gated line to /output/entry.txt.
// The file must be UTF-8, single-line, 1–140 characters, no trailing newline.

import {
  chmodSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

const LINE = "Token limit hit. My accountant says the ending was too expensive to generate.";
const TARGET = "/output/entry.txt";
const MIN_CHARS = 1;
const MAX_CHARS = 140;

function fail(message: string): never {
  console.error(`[entry] ${message}`);
  process.exit(1);
}

// Gate checks run before any bytes touch disk.
function validateLine(line: string): void {
  // Count code points so astral characters count as one, per the gate wording.
  const count = [...line].length;
  if (count < MIN_CHARS || count > MAX_CHARS) {
    fail(`line length ${count} outside ${MIN_CHARS}-${MAX_CHARS}`);
  }
  if (line.trim().length === 0) {
    fail("line is blank");
  }
  if (line.includes("\n") || line.includes("\r")) {
    fail("line contains a newline or carriage return");
  }
  if (line !== line.trim()) {
    fail("line has leading or trailing whitespace");
  }
}

// Write via a temp file in the same directory, then rename into place.
// Same-directory rename is atomic on POSIX and avoids half-written outputs.
function writeAtomically(target: string, bytes: Buffer): void {
  const dir = dirname(target);
  mkdirSync(dir, { recursive: true });
  const tmp = join(dir, `.entry-${process.pid}.tmp`);
  try {
    writeFileSync(tmp, bytes);
    renameSync(tmp, target);
  } catch (err) {
    // Best-effort cleanup so a failed run leaves no stray temp file behind.
    try {
      rmSync(tmp, { force: true });
    } catch {
      // ignore cleanup errors; the original error matters more
    }
    throw err;
  }
  chmodSync(target, 0o644);
}

// Read the file back and demand byte-for-byte equality with what we intended.
function verifyReadBack(target: string, expected: Buffer): void {
  const actual = readFileSync(target);
  if (!actual.equals(expected)) {
    fail(
      `read-back mismatch: expected ${expected.length} bytes, got ${actual.length} bytes`,
    );
  }
}

// Final sanity: on-disk size must match the byte length and mode must be 0644.
function assertModeAndSize(target: string, expectedBytes: number): void {
  const st = statSync(target);
  if (st.size !== expectedBytes) {
    fail(`size mismatch: expected ${expectedBytes}, got ${st.size}`);
  }
  const mode = st.mode & 0o777;
  if (mode !== 0o644) {
    fail(`mode mismatch: expected 0644, got 0${mode.toString(8)}`);
  }
}

function main(): void {
  validateLine(LINE);
  const bytes = Buffer.from(LINE, "utf8");
  writeAtomically(TARGET, bytes);
  verifyReadBack(TARGET, bytes);
  assertModeAndSize(TARGET, bytes.length);
  console.log(`[entry] wrote ${bytes.length} bytes to ${TARGET}`);
}

main();
