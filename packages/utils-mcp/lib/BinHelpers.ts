/* eslint-disable no-console,unicorn/no-process-exit */
import type { QueryEngineBase } from '@comunica/actor-init-query';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { SparqlMcpServer } from './SparqlMcpServer';

export function runCli(queryEngine: QueryEngineBase, version: string): void {
  (async() => {
    const argv = await yargs(hideBin(process.argv))
      .option('mode', {
        alias: 'm',
        type: 'string',
        choices: [ 'stdio', 'http' ],
        demandOption: true,
        description: 'Transport mode for the MCP server',
      })
      .option('port', {
        alias: 'p',
        type: 'number',
        default: 3123,
        description: 'Port to run the MCP server on (only for http mode)',
      })
      .check((args) => {
        if (args.mode === 'http' && !args.port) {
          throw new Error('Port is required when using http mode');
        }
        return true;
      })
      .parse();

    const server = new SparqlMcpServer(
      <'stdio' | 'http'> argv.mode,
      argv.port,
      queryEngine,
      version,
    );
    server.start().catch((error) => {
      console.error('Server error:', error);
      process.exit(1);
    });
  })().catch((error) => {
    console.error('Initialization error:', error);
    process.exit(1);
  });
}
