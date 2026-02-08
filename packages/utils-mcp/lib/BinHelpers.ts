/* eslint-disable unicorn/no-process-exit */
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
      .parse();

    const server = new SparqlMcpServer(
      <'stdio' | 'http'> argv.mode,
      argv.port,
      queryEngine,
      version,
      process.stderr,
    );
    server.start().catch((error) => {
      process.stderr.write(`Server error: ${error.message}\n`);
      if (error.stack) {
        process.stderr.write(`${error.stack}\n`);
      }
      process.exit(1);
    });
  })().catch((error) => {
    process.stderr.write(`Initialization error: ${error.message}\n`);
    if (error.stack) {
      process.stderr.write(`${error.stack}\n`);
    }
    process.exit(1);
  });
}
