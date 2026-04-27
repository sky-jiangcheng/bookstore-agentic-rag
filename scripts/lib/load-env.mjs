import fs from 'node:fs';
import path from 'node:path';

export function loadEnvFile(envFile) {
  if (!envFile) {
    return;
  }

  const resolvedPath = path.isAbsolute(envFile) ? envFile : path.resolve(process.cwd(), envFile);
  const content = fs.readFileSync(resolvedPath, 'utf8');

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
      continue;
    }

    const index = trimmed.indexOf('=');
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}
