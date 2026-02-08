/* eslint-disable import/no-nodejs-modules */
import type { Writable } from 'node:stream';
import type { QueryEngineBase } from '@comunica/actor-init-query';
import type { IQuerySourceSerialized, IQuerySourceUnidentifiedExpanded } from '@comunica/types';
import type { Context, FastMCPSessionAuth } from 'fastmcp';
import { FastMCP } from 'fastmcp';
import { z } from 'zod';

/**
 * An MCP server for querying over one or more Knowledge Graphs using SPARQL queries.
 */
export class SparqlMcpServer {
  private readonly server: FastMCP;
  private readonly stderr: Writable;
  private queryId = 0;

  public constructor(
    private readonly mode: 'stdio' | 'http',
    private readonly port: number,
    private readonly queryEngine: QueryEngineBase,
    version: string,
    stderr: Writable,
  ) {
    this.stderr = stderr;
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
      this.stderr.write(`SPARQL MCP Server running in stdio mode\n`);
    } else {
      await this.server.start({
        transportType: 'httpStream',
        httpStream: {
          port: this.port,
          stateless: true,
        },
      });
      this.stderr.write(`SPARQL MCP Server listening on port ${this.port}\n`);
    }
  }

  /**
   * Parse a source string that may contain a type prefix (e.g., 'sparql@https://example.org/sparql').
   * This follows the same syntax as the Comunica CLI for forcing source types.
   * @param sourceString A source URL that may be prefixed with a type annotation.
   * @returns An object with 'value' and optionally 'type' properties.
   */
  protected parseSourceString(sourceString: string): IQuerySourceUnidentifiedExpanded {
    const source: IQuerySourceUnidentifiedExpanded = { value: '' };
    const typeRegex = /^([^:]*)@/u;
    const typeMatches = typeRegex.exec(sourceString);
    if (typeMatches) {
      source.type = typeMatches[1];
      sourceString = sourceString.slice((source.type.length) + 1);
    }
    source.value = sourceString;
    return source;
  }

  protected registerTools(): void {
    this.server.addTool({
      name: 'query_sparql',
      description: `Execute a SPARQL query over one or more sources. When sending a SELECT query, results are serialized as 'application/sparql-results+json', CONSTRUCT and DESCRIBE results are in 'application/trig', and ASK queries return true or false. Update queries (INSERT/DELETE) can also be passed, which in most cases will only work on private Knowledge Graphs or by passing authentication.`,
      parameters: z.object({
        query: z.string().describe('SPARQL query string'),
        sources: z.array(z.string()).describe(`List of SPARQL endpoint URLs, TPF interface URLs, or Linked Data (RDF) file paths. You can optionally force a source type by prefixing the URL with a type annotation (e.g., 'sparql@https://example.org/sparql', 'file@/path/to/file.ttl', 'hypermedia@https://example.org/'). This is useful when the source type is already known to avoid auto-detection overhead.`),
      }),
      annotations: {
        // Signals this tool uses streaming
        streamingHint: true,
        readOnlyHint: true,
      },
      execute: (args, context) => this.executeQuerySparql(args, context),
    });

    this.server.addTool({
      name: 'query_sparql_rdf',
      description: `Execute a SPARQL query over a serialized RDF dataset provided as a string. This is useful for querying RDF data that is already available as a string (e.g., Turtle, N-Triples, etc.). When sending a SELECT query, results are serialized as 'application/sparql-results+json', CONSTRUCT and DESCRIBE results are in 'application/trig', and ASK queries return true or false.`,
      parameters: z.object({
        query: z.string().describe('SPARQL query string'),
        value: z.string().describe('Serialized RDF dataset as a string'),
        mediaType: z.string().describe(`Media type of the serialized RDF dataset (e.g., 'text/turtle', 'application/n-triples', 'application/ld+json', 'application/rdf+xml', 'application/n-quads', 'application/trig')`),
        baseIRI: z.string().optional().describe('Optional base IRI for resolving relative IRIs in the RDF dataset'),
      }),
      annotations: {
        // Signals this tool uses streaming
        streamingHint: true,
        readOnlyHint: true,
      },
      execute: (args, context) => this.executeQuerySparqlRdf(args, context),
    });
  }

  /**
   * Execute a SPARQL query and stream the results back to the client.
   * This method contains the common logic for executing queries and handling results.
   * @param query The SPARQL query string
   * @param sources Array of query sources
   * @param queryId The query ID for logging
   * @param context The MCP context for streaming results
   * @returns The query results as a string or an error object
   */
  protected async executeQuery(
    query: string,
    sources: IQuerySourceUnidentifiedExpanded[],
    queryId: number,
    context: Context<FastMCPSessionAuth>,
  ): Promise<any> {
    await context.streamContent({ type: 'text', text: `Streaming SPARQL query results hereafter:` });

    try {
      const promises: Promise<any>[] = [];
      const chunks: string[] = [];
      const queryResult = await this.queryEngine.query(query, { sources });
      const { data } = await this.queryEngine.resultToString(queryResult);
      data.on('data', (chunk: string) => {
        chunks.push(chunk);
        promises.push(context.streamContent({ type: 'text', text: chunk.toString() }));
      });
      await new Promise((resolve, reject) => {
        data.on('error', reject);
        data.on('end', resolve);
      });
      await Promise.all(promises);

      // Log successful completion
      this.stderr.write(`[Query ${queryId}] Successfully completed\n`);

      return chunks.join('');
    } catch (error: any) {
      // Log query failure
      this.stderr.write(`[Query ${queryId}] Failed with error: ${error.message}\n`);
      if (error.stack) {
        this.stderr.write(`[Query ${queryId}] Stack trace: ${error.stack}\n`);
      }

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

  protected async executeQuerySparql(
    args: { query: string; sources: string[] },
    context: Context<FastMCPSessionAuth>,
  ): Promise<any> {
    const { query, sources } = args;
    const currentQueryId = this.queryId++;

    // Parse sources to extract type annotations
    const parsedSources = sources.map(sourceString => this.parseSourceString(sourceString));

    // Log query start
    this.stderr.write(`[Query ${currentQueryId}] Starting SPARQL query\n`);
    this.stderr.write(`[Query ${currentQueryId}] Sources: ${sources.join(', ')}\n`);
    this.stderr.write(`[Query ${currentQueryId}] Query: ${query}\n`);

    return this.executeQuery(query, parsedSources, currentQueryId, context);
  }

  protected async executeQuerySparqlRdf(
    args: { query: string; value: string; mediaType: string; baseIRI?: string },
    context: Context<FastMCPSessionAuth>,
  ): Promise<any> {
    const { query, value, mediaType, baseIRI } = args;
    const currentQueryId = this.queryId++;

    // Create a serialized source
    const source: IQuerySourceSerialized = {
      type: 'serialized',
      value,
      mediaType,
      ...(baseIRI && { baseIRI }),
    };

    // Log query start
    this.stderr.write(`[Query ${currentQueryId}] Starting SPARQL query on serialized RDF\n`);
    this.stderr.write(`[Query ${currentQueryId}] Media type: ${mediaType}\n`);
    if (baseIRI) {
      this.stderr.write(`[Query ${currentQueryId}] Base IRI: ${baseIRI}\n`);
    }
    this.stderr.write(`[Query ${currentQueryId}] Query: ${query}\n`);

    return this.executeQuery(query, [ source ], currentQueryId, context);
  }
}
