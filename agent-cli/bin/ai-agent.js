#!/usr/bin/env node

import { main } from '../src/cli.js';

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[ai-agent] ${message}`);
  process.exitCode = 1;
});
