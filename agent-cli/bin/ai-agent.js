#!/usr/bin/env node

import { main } from '../src/cli.js';

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[Frees Agent] ${message}`);
  process.exitCode = 1;
});
