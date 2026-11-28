import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';

if (process.env.PORT === undefined) {
  const content = await readFile('.env', 'utf8').catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return '';
  });
  const { PORT } = parseEnv(content);
  if (PORT) process.env.PORT = PORT;
}

await import('next/dist/bin/next');
