#!/usr/bin/env node
import { QueryEngine } from '@comunica/query-sparql';
import { runCli } from '@comunica/utils-mcp';

// eslint-disable-next-line ts/no-require-imports,ts/no-var-requires,import/extensions
runCli(new QueryEngine(), require('../package.json').version);
