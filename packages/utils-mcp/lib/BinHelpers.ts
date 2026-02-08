/* eslint-disable no-console,unicorn/no-process-exit */
import type { QueryEngineBase } from '@comunica/actor-init-query';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { SparqlMcpServer } from './SparqlMcpServer';

export function runCli(queryEngine: QueryEngineBase, version: string): void {
  (async() => {
    const argv = await yargs(hideBin(process.argv))
      .option('port', {
        alias: 'p',
        type: 'number',
        default: 3123,
        description: 'Port to run the MCP server on',
      })
      .parse();

    const server = new SparqlMcpServer(argv.port, queryEngine, version);
    server.start().catch((error) => {
      console.error('Server error:', error);
      process.exit(1);
    });
  })().catch((error) => {
    console.error('Initialization error:', error);
    process.exit(1);
  });
}
