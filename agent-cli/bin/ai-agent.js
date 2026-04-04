#!/usr/bin/env node

import { main } from '../src/cli.js';

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[Frees Agent] ${message}`);
  process.exitCode = 1;
});

// const cli = require('../dist/frees-agent.js');

// cli.main(process.argv.slice(2)).catch(err => {
//   console.error('[Frees Agent]', err);
//   process.exit(1);
// });