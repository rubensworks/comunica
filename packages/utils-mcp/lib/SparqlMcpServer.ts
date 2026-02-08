import type { QueryEngineBase } from '@comunica/actor-init-query';
import type { Context, FastMCPSessionAuth } from 'fastmcp';
import { FastMCP } from 'fastmcp';
import { z } from 'zod';

/**
 * An MCP server for querying over one or more Knowledge Graphs using SPARQL queries.
 */
export class SparqlMcpServer {
  private readonly server: FastMCP;

  public constructor(
    private readonly mode: 'stdio' | 'http',
    private readonly port: number,
    private readonly queryEngine: QueryEngineBase,
    version: string,
  ) {
    this.server = new FastMCP({
      name: 'sparql-mcp',
      version: <any> version,
    });

    this.registerTools();
  }

  /**
   * Start the MCP server in the configured mode (stdio or HTTP stream).
   */
  public async start(): Promise<void> {
    if (this.mode === 'stdio') {
      await this.server.start({
        transportType: 'stdio',
      });
      // eslint-disable-next-line no-console
      console.error(`SPARQL MCP Server running in stdio mode`);
    } else {
      await this.server.start({
        transportType: 'httpStream',
        httpStream: {
          port: this.port,
          stateless: true,
        },
      });
      // eslint-disable-next-line no-console
      console.error(`SPARQL MCP Server listening on port ${this.port}`);
    }
  }

  protected registerTools(): void {
    this.server.addTool({
      name: 'query_sparql',
      description: `Execute a SPARQL query over one or more sources. When sending a SELECT query, results are serialized as 'application/sparql-results+json', CONSTRUCT and DESCRIBE results are in 'application/trig', and ASK queries return true or false.`,
      parameters: z.object({
        query: z.string().describe('SPARQL query string'),
        sources: z.array(z.string()).describe(`List of SPARQL endpoint URLs, TPF interface URLs, or Linked Data (RDF) file paths`),
      }),
      annotations: {
        // Signals this tool uses streaming
        streamingHint: true,
        readOnlyHint: true,
      },
      execute: (args, context) => this.executeQuerySparql(args, context),
    });
  }

  protected async executeQuerySparql(
    args: { query: string; sources: string[] },
    context: Context<FastMCPSessionAuth>,
  ): Promise<any> {
    const { query, sources } = args;
    await context.streamContent({ type: 'text', text: `Streaming SPARQL query results hereafter:` });
    // eslint-disable-next-line no-console
    console.error(`Executing query on ${sources.join(', ')}`);

    try {
      const promises: Promise<any>[] = [];
      const chunks: string[] = [];
      const { data } = await this.queryEngine.resultToString(await this.queryEngine.query(query, { sources }));
      data.on('data', (chunk: string) => {
        chunks.push(chunk);
        promises.push(context.streamContent({ type: 'text', text: chunk.toString() }));
      });
      await new Promise((resolve, reject) => {
        data.on('error', reject);
        data.on('end', resolve);
      });
      await Promise.all(promises);
      return chunks.join('');
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error(error);
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Query failed: ${error.message}`,
          },
        ],
      };
    }
  }
}
