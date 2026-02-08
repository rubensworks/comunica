import { Readable, Writable } from 'node:stream';
import type { QueryEngineBase } from '@comunica/actor-init-query';
import type { Context, FastMCPSessionAuth } from 'fastmcp';
import { SparqlMcpServer } from '../lib/SparqlMcpServer';

jest.mock('fastmcp');

// Mock FastMCP with a factory that doesn't import the actual module
const mockAddTool = jest.fn();
const mockStart = jest.fn().mockResolvedValue(undefined);
let toolExecuteCallbacks: any[] = [];
const stderr = {
  write: jest.fn(),
};

jest.mock<typeof import('fastmcp')>('fastmcp', () => (<any> {
  FastMCP: jest.fn().mockImplementation(() => ({
    addTool: (config: any) => {
      mockAddTool(config);
      // Capture the execute callback for testing
      toolExecuteCallbacks.push(config.execute);
    },
    start: mockStart,
  })),
}));

const mockQueryEngine = {
  query: jest.fn(),
  resultToString: jest.fn(),
};

describe('SparqlMcpServer', () => {
  let server: SparqlMcpServer;
  let mockStderr: Writable;
  let stderrWrites: string[];

  beforeEach(() => {
    // Reset mocks
    mockAddTool.mockClear();
    mockStart.mockClear();
    mockQueryEngine.query.mockClear();
    mockQueryEngine.resultToString.mockClear();
    toolExecuteCallbacks = [];

    // Create a mock stderr stream
    stderrWrites = [];
    mockStderr = new Writable({
      write(chunk: any, encoding: any, callback: any) {
        stderrWrites.push(chunk.toString());
        callback();
      },
    });

    server = new SparqlMcpServer('http', 3000, <QueryEngineBase> <unknown> mockQueryEngine, '1.2.3', mockStderr);
  });

  describe('start', () => {
    it('should start FastMCP server on specified port in http mode', async() => {
      await server.start();

      expect(mockStart).toHaveBeenCalledWith({
        transportType: 'httpStream',
        httpStream: {
          port: 3000,
          stateless: true,
        },
      });
    });

    it('should start FastMCP server in stdio mode', async() => {
      const stdioServer = new SparqlMcpServer(
        'stdio',
        3000,
        <QueryEngineBase> <unknown> mockQueryEngine,
        '1.2.3',
        mockStderr,
      );
      await stdioServer.start();

      expect(mockStart).toHaveBeenCalledWith({
        transportType: 'stdio',
      });
    });

    it('should start FastMCP server in stdio mode without using port', async() => {
      // Port parameter is ignored in stdio mode
      const stdioServer = new SparqlMcpServer(
        'stdio',
        0,
        <QueryEngineBase> <unknown> mockQueryEngine,
        '1.2.3',
        mockStderr,
      );
      await stdioServer.start();

      expect(mockStart).toHaveBeenCalledWith({
        transportType: 'stdio',
      });
      // Verify that httpStream config was not passed
      expect(mockStart).not.toHaveBeenCalledWith(expect.objectContaining({
        httpStream: expect.anything(),
      }));
    });

    it('should accept process.stderr as stderr parameter', async() => {
      const defaultServer = new SparqlMcpServer(
        'http',
        3000,
        <QueryEngineBase> <unknown> mockQueryEngine,
        '1.2.3',
        <any> stderr,
      );
      await defaultServer.start();

      // Should not throw error - successfully using process.stderr
      expect(mockStart).toHaveBeenCalledWith(expect.objectContaining({
        transportType: 'httpStream',
      }));
      expect(stderr.write).toHaveBeenCalledWith('SPARQL MCP Server listening on port 3000\n');
    });

    it('should log startup message to stderr in http mode', async() => {
      await server.start();

      expect(stderrWrites.join('')).toContain('SPARQL MCP Server listening on port 3000');
    });

    it('should log startup message to stderr in stdio mode', async() => {
      const stdioServer = new SparqlMcpServer(
        'stdio',
        3000,
        <QueryEngineBase> <unknown> mockQueryEngine,
        '1.2.3',
        mockStderr,
      );
      await stdioServer.start();

      expect(stderrWrites.join('')).toContain('SPARQL MCP Server running in stdio mode');
    });
  });

  describe('tool registration', () => {
    it('should register query_sparql tool', () => {
      expect(mockAddTool).toHaveBeenCalledWith({
        name: 'query_sparql',
        description: expect.any(String),
        parameters: expect.any(Object),
        execute: expect.any(Function),
        annotations: {
          streamingHint: true,
          readOnlyHint: true,
        },
      });
    });

    it('should register query_sparql_rdf tool', () => {
      expect(mockAddTool).toHaveBeenCalledWith({
        name: 'query_sparql_rdf',
        description: expect.any(String),
        parameters: expect.any(Object),
        execute: expect.any(Function),
        annotations: {
          streamingHint: true,
          readOnlyHint: true,
        },
      });
    });
  });

  describe('query_sparql tool logic', () => {
    let ctx: Context<FastMCPSessionAuth>;
    let toolExecuteCallback: any;

    beforeEach(() => {
      ctx = <any> {
        streamContent: jest.fn(),
      };
      // The first tool registered is query_sparql
      toolExecuteCallback = toolExecuteCallbacks[0];
    });

    it('should execute query', async() => {
      mockQueryEngine.query.mockResolvedValue({});
      mockQueryEngine.resultToString.mockResolvedValue({
        data: Readable.from([ 'RESULT' ]),
      });
      const result = await toolExecuteCallback(
        { query: 'SELECT *', sources: [ 'http://ex.org' ]},
        ctx,
      );
      expect(mockQueryEngine.query).toHaveBeenCalledWith('SELECT *', {
        sources: [{ value: 'http://ex.org' }],
      });
      expect(result).toBe('RESULT');
    });

    it('should handle query errors', async() => {
      mockQueryEngine.query.mockRejectedValue(new Error('Query failed'));

      const result = await toolExecuteCallback({ query: 'BAD', sources: []}, ctx);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Query failed');
    });

    it('should log query start to stderr', async() => {
      mockQueryEngine.query.mockResolvedValue({});
      mockQueryEngine.resultToString.mockResolvedValue({
        data: Readable.from([ 'RESULT' ]),
      });

      stderrWrites = [];
      await toolExecuteCallback(
        { query: 'SELECT * WHERE { ?s ?p ?o }', sources: [ 'http://ex.org' ]},
        ctx,
      );

      const logOutput = stderrWrites.join('');
      expect(logOutput).toContain('[Query 0] Starting SPARQL query');
      expect(logOutput).toContain('[Query 0] Sources: http://ex.org');
      expect(logOutput).toContain('[Query 0] Query: SELECT * WHERE { ?s ?p ?o }');
    });

    it('should log query success to stderr', async() => {
      mockQueryEngine.query.mockResolvedValue({});
      mockQueryEngine.resultToString.mockResolvedValue({
        data: Readable.from([ 'RESULT' ]),
      });

      stderrWrites = [];
      await toolExecuteCallback(
        { query: 'SELECT *', sources: [ 'http://ex.org' ]},
        ctx,
      );

      const logOutput = stderrWrites.join('');
      expect(logOutput).toContain('[Query 0] Successfully completed');
    });

    it('should log query failure to stderr', async() => {
      const testError = new Error('Query failed');
      mockQueryEngine.query.mockRejectedValue(testError);

      stderrWrites = [];
      await toolExecuteCallback({ query: 'BAD', sources: []}, ctx);

      const logOutput = stderrWrites.join('');
      expect(logOutput).toContain('[Query 0] Failed with error: Query failed');
    });

    it('should increment query ID for each query', async() => {
      mockQueryEngine.query.mockResolvedValue({});
      mockQueryEngine.resultToString.mockImplementation(async() => ({
        data: Readable.from([ 'RESULT' ]),
      }));

      stderrWrites = [];
      await toolExecuteCallback({ query: 'SELECT * 1', sources: []}, ctx);
      await toolExecuteCallback({ query: 'SELECT * 2', sources: []}, ctx);

      const logOutput = stderrWrites.join('');
      expect(logOutput).toContain('[Query 0]');
      expect(logOutput).toContain('[Query 1]');
    });

    it('should parse source type prefix and pass to query engine', async() => {
      mockQueryEngine.query.mockResolvedValue({});
      mockQueryEngine.resultToString.mockResolvedValue({
        data: Readable.from([ 'RESULT' ]),
      });

      await toolExecuteCallback(
        { query: 'SELECT *', sources: [ 'sparql@http://ex.org/sparql' ]},
        ctx,
      );

      expect(mockQueryEngine.query).toHaveBeenCalledWith('SELECT *', {
        sources: [{ value: 'http://ex.org/sparql', type: 'sparql' }],
      });
    });

    it('should parse multiple sources with mixed type prefixes', async() => {
      mockQueryEngine.query.mockResolvedValue({});
      mockQueryEngine.resultToString.mockResolvedValue({
        data: Readable.from([ 'RESULT' ]),
      });

      await toolExecuteCallback(
        {
          query: 'SELECT *',
          sources: [
            'sparql@http://ex.org/sparql',
            'http://plain.org',
            'file@/path/to/file.ttl',
          ],
        },
        ctx,
      );

      expect(mockQueryEngine.query).toHaveBeenCalledWith('SELECT *', {
        sources: [
          { value: 'http://ex.org/sparql', type: 'sparql' },
          { value: 'http://plain.org' },
          { value: '/path/to/file.ttl', type: 'file' },
        ],
      });
    });

    it('should handle hypermedia type prefix', async() => {
      mockQueryEngine.query.mockResolvedValue({});
      mockQueryEngine.resultToString.mockResolvedValue({
        data: Readable.from([ 'RESULT' ]),
      });

      await toolExecuteCallback(
        { query: 'SELECT *', sources: [ 'hypermedia@http://ex.org/fragments' ]},
        ctx,
      );

      expect(mockQueryEngine.query).toHaveBeenCalledWith('SELECT *', {
        sources: [{ value: 'http://ex.org/fragments', type: 'hypermedia' }],
      });
    });
  });

  describe('executeQuery with default context', () => {
    let ctx: Context<FastMCPSessionAuth>;

    beforeEach(() => {
      ctx = <any> {
        streamContent: jest.fn(),
      };
    });

    it('should execute query with default queryContext parameter', async() => {
      mockQueryEngine.query.mockResolvedValue({});
      mockQueryEngine.resultToString.mockResolvedValue({
        data: Readable.from([ 'RESULT' ]),
      });

      // Call executeQuery without the optional queryContext parameter
      const result = await (<any> server).executeQuery(
        'SELECT *',
        [{ value: 'http://ex.org' }],
        0,
        ctx,
      );

      expect(mockQueryEngine.query).toHaveBeenCalledWith('SELECT *', {
        sources: [{ value: 'http://ex.org' }],
      });
      expect(result).toBe('RESULT');
    });
  });

  describe('query_sparql_rdf tool logic', () => {
    let ctx: Context<FastMCPSessionAuth>;
    let toolExecuteCallbackRdf: any;

    beforeEach(() => {
      ctx = <any> {
        streamContent: jest.fn(),
      };
      // The second tool registered is query_sparql_rdf
      toolExecuteCallbackRdf = toolExecuteCallbacks[1];
    });

    it('should execute query on serialized RDF with required parameters', async() => {
      mockQueryEngine.query.mockResolvedValue({});
      mockQueryEngine.resultToString.mockResolvedValue({
        data: Readable.from([ 'RESULT' ]),
      });

      const result = await toolExecuteCallbackRdf(
        {
          query: 'SELECT * WHERE { ?s ?p ?o }',
          value: '<http://example.org/s> <http://example.org/p> <http://example.org/o>.',
          mediaType: 'text/turtle',
        },
        ctx,
      );

      expect(mockQueryEngine.query).toHaveBeenCalledWith('SELECT * WHERE { ?s ?p ?o }', {
        sources: [{
          type: 'serialized',
          value: '<http://example.org/s> <http://example.org/p> <http://example.org/o>.',
          mediaType: 'text/turtle',
        }],
      });
      expect(result).toBe('RESULT');
    });

    it('should execute query with fileBaseIRI parameter', async() => {
      mockQueryEngine.query.mockResolvedValue({});
      mockQueryEngine.resultToString.mockResolvedValue({
        data: Readable.from([ 'RESULT' ]),
      });

      await toolExecuteCallbackRdf(
        {
          query: 'SELECT * WHERE { ?s ?p ?o }',
          value: '<s> <p> <o>.',
          mediaType: 'text/turtle',
          fileBaseIRI: 'http://example.org/',
        },
        ctx,
      );

      expect(mockQueryEngine.query).toHaveBeenCalledWith('SELECT * WHERE { ?s ?p ?o }', {
        sources: [{
          type: 'serialized',
          value: '<s> <p> <o>.',
          mediaType: 'text/turtle',
          baseIRI: 'http://example.org/',
        }],
      });
    });

    it('should handle different media types', async() => {
      mockQueryEngine.query.mockResolvedValue({});
      mockQueryEngine.resultToString.mockResolvedValue({
        data: Readable.from([ 'RESULT' ]),
      });

      await toolExecuteCallbackRdf(
        {
          query: 'SELECT * WHERE { ?s ?p ?o }',
          value: '<http://example.org/s> <http://example.org/p> <http://example.org/o> .',
          mediaType: 'application/n-triples',
        },
        ctx,
      );

      expect(mockQueryEngine.query).toHaveBeenCalledWith('SELECT * WHERE { ?s ?p ?o }', {
        sources: [{
          type: 'serialized',
          value: '<http://example.org/s> <http://example.org/p> <http://example.org/o> .',
          mediaType: 'application/n-triples',
        }],
      });
    });

    it('should handle query errors', async() => {
      mockQueryEngine.query.mockRejectedValue(new Error('Parse error'));

      const result = await toolExecuteCallbackRdf(
        {
          query: 'BAD QUERY',
          value: '<s> <p> <o>.',
          mediaType: 'text/turtle',
        },
        ctx,
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Query failed: Parse error');
    });

    it('should log query start to stderr', async() => {
      mockQueryEngine.query.mockResolvedValue({});
      mockQueryEngine.resultToString.mockResolvedValue({
        data: Readable.from([ 'RESULT' ]),
      });

      stderrWrites = [];
      await toolExecuteCallbackRdf(
        {
          query: 'SELECT * WHERE { ?s ?p ?o }',
          value: '<s> <p> <o>.',
          mediaType: 'text/turtle',
        },
        ctx,
      );

      const logOutput = stderrWrites.join('');
      expect(logOutput).toContain('Starting SPARQL query on serialized RDF');
      expect(logOutput).toContain('Media type: text/turtle');
      expect(logOutput).toContain('Query: SELECT * WHERE { ?s ?p ?o }');
    });

    it('should log fileBaseIRI when provided', async() => {
      mockQueryEngine.query.mockResolvedValue({});
      mockQueryEngine.resultToString.mockResolvedValue({
        data: Readable.from([ 'RESULT' ]),
      });

      stderrWrites = [];
      await toolExecuteCallbackRdf(
        {
          query: 'SELECT * WHERE { ?s ?p ?o }',
          value: '<s> <p> <o>.',
          mediaType: 'text/turtle',
          fileBaseIRI: 'http://example.org/',
        },
        ctx,
      );

      const logOutput = stderrWrites.join('');
      expect(logOutput).toContain('File Base IRI: http://example.org/');
    });

    it('should log query success to stderr', async() => {
      mockQueryEngine.query.mockResolvedValue({});
      mockQueryEngine.resultToString.mockResolvedValue({
        data: Readable.from([ 'RESULT' ]),
      });

      stderrWrites = [];
      await toolExecuteCallbackRdf(
        {
          query: 'SELECT * WHERE { ?s ?p ?o }',
          value: '<s> <p> <o>.',
          mediaType: 'text/turtle',
        },
        ctx,
      );

      const logOutput = stderrWrites.join('');
      expect(logOutput).toContain('Successfully completed');
    });

    it('should log query failure to stderr', async() => {
      mockQueryEngine.query.mockRejectedValue(new Error('Parse error'));

      stderrWrites = [];
      await toolExecuteCallbackRdf(
        {
          query: 'BAD QUERY',
          value: '<s> <p> <o>.',
          mediaType: 'text/turtle',
        },
        ctx,
      );

      const logOutput = stderrWrites.join('');
      expect(logOutput).toContain('Failed with error: Parse error');
    });

    it('should stream content correctly', async() => {
      mockQueryEngine.query.mockResolvedValue({});
      mockQueryEngine.resultToString.mockResolvedValue({
        data: Readable.from([ 'CHUNK1', 'CHUNK2', 'CHUNK3' ]),
      });

      const result = await toolExecuteCallbackRdf(
        {
          query: 'SELECT * WHERE { ?s ?p ?o }',
          value: '<s> <p> <o>.',
          mediaType: 'text/turtle',
        },
        ctx,
      );

      expect(result).toBe('CHUNK1CHUNK2CHUNK3');
      expect(ctx.streamContent).toHaveBeenCalledWith({
        type: 'text',
        text: 'Streaming SPARQL query results hereafter:',
      });
      expect(ctx.streamContent).toHaveBeenCalledWith({ type: 'text', text: 'CHUNK1' });
      expect(ctx.streamContent).toHaveBeenCalledWith({ type: 'text', text: 'CHUNK2' });
      expect(ctx.streamContent).toHaveBeenCalledWith({ type: 'text', text: 'CHUNK3' });
    });
  });

  describe('parseSourceString', () => {
    it('should parse normal URL without type prefix', () => {
      const result = (<any> server).parseSourceString('http://example.org/');
      expect(result).toEqual({ value: 'http://example.org/' });
    });

    it('should parse sparql type prefix', () => {
      const result = (<any> server).parseSourceString('sparql@http://example.org/sparql');
      expect(result).toEqual({ value: 'http://example.org/sparql', type: 'sparql' });
    });

    it('should parse file type prefix', () => {
      const result = (<any> server).parseSourceString('file@/path/to/file.ttl');
      expect(result).toEqual({ value: '/path/to/file.ttl', type: 'file' });
    });

    it('should parse hypermedia type prefix', () => {
      const result = (<any> server).parseSourceString('hypermedia@http://example.org/');
      expect(result).toEqual({ value: 'http://example.org/', type: 'hypermedia' });
    });

    it('should handle URLs with colons after prefix', () => {
      const result = (<any> server).parseSourceString('sparql@http://example.org:8080/sparql');
      expect(result).toEqual({ value: 'http://example.org:8080/sparql', type: 'sparql' });
    });
  });

  describe('buildQueryContext', () => {
    it('should build empty context when no options provided', () => {
      const result = (<any> server).buildQueryContext({});
      expect(result).toEqual({});
    });

    it('should add queryFormat when language provided', () => {
      const result = (<any> server).buildQueryContext({ queryFormatLanguage: 'sparql' });
      expect(result).toEqual({ queryFormat: { language: 'sparql', version: '1.1' }});
    });

    it('should add queryFormat when version provided', () => {
      const result = (<any> server).buildQueryContext({ queryFormatVersion: '1.2' });
      expect(result).toEqual({ queryFormat: { language: 'sparql', version: '1.2' }});
    });

    it('should add queryFormat with both language and version', () => {
      const result = (<any> server).buildQueryContext({
        queryFormatLanguage: 'sparql',
        queryFormatVersion: '1.2',
      });
      expect(result).toEqual({ queryFormat: { language: 'sparql', version: '1.2' }});
    });

    it('should add baseIRI when provided', () => {
      const result = (<any> server).buildQueryContext({ baseIRI: 'http://example.org/' });
      expect(result).toEqual({ baseIRI: 'http://example.org/' });
    });

    it('should add httpProxyHandler when httpProxy provided', async() => {
      const result = (<any> server).buildQueryContext({ httpProxy: 'http://proxy.example.com:8080' });
      expect(result.httpProxyHandler).toBeDefined();
      expect(result.httpProxyHandler.getProxy).toBeInstanceOf(Function);

      // Test that getProxy returns the correct proxy request
      const proxyRequest = await result.httpProxyHandler.getProxy({ input: 'http://example.org', init: {}});
      expect(proxyRequest).toEqual({
        input: 'http://proxy.example.com:8080',
        init: {},
      });
    });

    it('should add httpAuth when provided', () => {
      const result = (<any> server).buildQueryContext({ httpAuth: 'user:pass' });
      expect(result).toEqual({ httpAuth: 'user:pass' });
    });

    it('should add httpTimeout when provided', () => {
      const result = (<any> server).buildQueryContext({ httpTimeout: 5000 });
      expect(result).toEqual({ httpTimeout: 5000 });
    });

    it('should add httpRetryCount when provided', () => {
      const result = (<any> server).buildQueryContext({ httpRetryCount: 3 });
      expect(result).toEqual({ httpRetryCount: 3 });
    });

    it('should handle multiple options', () => {
      const result = (<any> server).buildQueryContext({
        queryFormatLanguage: 'sparql',
        queryFormatVersion: '1.2',
        baseIRI: 'http://example.org/',
        httpAuth: 'user:pass',
        httpTimeout: 10000,
        httpRetryCount: 5,
      });
      expect(result.queryFormat).toEqual({ language: 'sparql', version: '1.2' });
      expect(result.baseIRI).toBe('http://example.org/');
      expect(result.httpAuth).toBe('user:pass');
      expect(result.httpTimeout).toBe(10000);
      expect(result.httpRetryCount).toBe(5);
    });
  });

  describe('query_sparql with optional parameters', () => {
    let ctx: Context<FastMCPSessionAuth>;
    let toolExecuteCallback: any;

    beforeEach(() => {
      ctx = <any> {
        streamContent: jest.fn(),
      };
      toolExecuteCallback = toolExecuteCallbacks[0];
    });

    it('should pass queryFormat to query engine', async() => {
      mockQueryEngine.query.mockResolvedValue({});
      mockQueryEngine.resultToString.mockResolvedValue({
        data: Readable.from([ 'RESULT' ]),
      });

      await toolExecuteCallback(
        {
          query: 'SELECT *',
          sources: [ 'http://ex.org' ],
          queryFormatLanguage: 'sparql',
          queryFormatVersion: '1.1',
        },
        ctx,
      );

      expect(mockQueryEngine.query).toHaveBeenCalledWith('SELECT *', expect.objectContaining({
        sources: [{ value: 'http://ex.org' }],
        queryFormat: { language: 'sparql', version: '1.1' },
      }));
    });

    it('should pass baseIRI to query engine', async() => {
      mockQueryEngine.query.mockResolvedValue({});
      mockQueryEngine.resultToString.mockResolvedValue({
        data: Readable.from([ 'RESULT' ]),
      });

      await toolExecuteCallback(
        {
          query: 'SELECT *',
          sources: [ 'http://ex.org' ],
          baseIRI: 'http://base.org/',
        },
        ctx,
      );

      expect(mockQueryEngine.query).toHaveBeenCalledWith('SELECT *', expect.objectContaining({
        sources: [{ value: 'http://ex.org' }],
        baseIRI: 'http://base.org/',
      }));
    });

    it('should pass httpProxy to query engine as httpProxyHandler', async() => {
      mockQueryEngine.query.mockResolvedValue({});
      mockQueryEngine.resultToString.mockResolvedValue({
        data: Readable.from([ 'RESULT' ]),
      });

      await toolExecuteCallback(
        {
          query: 'SELECT *',
          sources: [ 'http://ex.org' ],
          httpProxy: 'http://proxy.example.com:8080',
        },
        ctx,
      );

      const callArgs = mockQueryEngine.query.mock.calls[0];
      expect(callArgs[1]).toHaveProperty('httpProxyHandler');
      expect(callArgs[1].httpProxyHandler.getProxy).toBeInstanceOf(Function);
    });

    it('should pass httpAuth to query engine', async() => {
      mockQueryEngine.query.mockResolvedValue({});
      mockQueryEngine.resultToString.mockResolvedValue({
        data: Readable.from([ 'RESULT' ]),
      });

      await toolExecuteCallback(
        {
          query: 'SELECT *',
          sources: [ 'http://ex.org' ],
          httpAuth: 'user:pass',
        },
        ctx,
      );

      expect(mockQueryEngine.query).toHaveBeenCalledWith('SELECT *', expect.objectContaining({
        sources: [{ value: 'http://ex.org' }],
        httpAuth: 'user:pass',
      }));
    });

    it('should pass httpTimeout to query engine', async() => {
      mockQueryEngine.query.mockResolvedValue({});
      mockQueryEngine.resultToString.mockResolvedValue({
        data: Readable.from([ 'RESULT' ]),
      });

      await toolExecuteCallback(
        {
          query: 'SELECT *',
          sources: [ 'http://ex.org' ],
          httpTimeout: 5000,
        },
        ctx,
      );

      expect(mockQueryEngine.query).toHaveBeenCalledWith('SELECT *', expect.objectContaining({
        sources: [{ value: 'http://ex.org' }],
        httpTimeout: 5000,
      }));
    });

    it('should pass httpRetryCount to query engine', async() => {
      mockQueryEngine.query.mockResolvedValue({});
      mockQueryEngine.resultToString.mockResolvedValue({
        data: Readable.from([ 'RESULT' ]),
      });

      await toolExecuteCallback(
        {
          query: 'SELECT *',
          sources: [ 'http://ex.org' ],
          httpRetryCount: 3,
        },
        ctx,
      );

      expect(mockQueryEngine.query).toHaveBeenCalledWith('SELECT *', expect.objectContaining({
        sources: [{ value: 'http://ex.org' }],
        httpRetryCount: 3,
      }));
    });

    it('should pass multiple optional parameters to query engine', async() => {
      mockQueryEngine.query.mockResolvedValue({});
      mockQueryEngine.resultToString.mockResolvedValue({
        data: Readable.from([ 'RESULT' ]),
      });

      await toolExecuteCallback(
        {
          query: 'SELECT *',
          sources: [ 'http://ex.org' ],
          queryFormatLanguage: 'sparql',
          queryFormatVersion: '1.2',
          baseIRI: 'http://base.org/',
          httpAuth: 'user:pass',
          httpTimeout: 10000,
          httpRetryCount: 5,
        },
        ctx,
      );

      expect(mockQueryEngine.query).toHaveBeenCalledWith('SELECT *', expect.objectContaining({
        sources: [{ value: 'http://ex.org' }],
        queryFormat: { language: 'sparql', version: '1.2' },
        baseIRI: 'http://base.org/',
        httpAuth: 'user:pass',
        httpTimeout: 10000,
        httpRetryCount: 5,
      }));
    });
  });

  describe('query_sparql_rdf with optional parameters', () => {
    let ctx: Context<FastMCPSessionAuth>;
    let toolExecuteCallbackRdf: any;

    beforeEach(() => {
      ctx = <any> {
        streamContent: jest.fn(),
      };
      toolExecuteCallbackRdf = toolExecuteCallbacks[1];
    });

    it('should pass queryFormat to query engine', async() => {
      mockQueryEngine.query.mockResolvedValue({});
      mockQueryEngine.resultToString.mockResolvedValue({
        data: Readable.from([ 'RESULT' ]),
      });

      await toolExecuteCallbackRdf(
        {
          query: 'SELECT * WHERE { ?s ?p ?o }',
          value: '<s> <p> <o>.',
          mediaType: 'text/turtle',
          queryFormatLanguage: 'sparql',
          queryFormatVersion: '1.1',
        },
        ctx,
      );

      expect(mockQueryEngine.query).toHaveBeenCalledWith('SELECT * WHERE { ?s ?p ?o }', expect.objectContaining({
        queryFormat: { language: 'sparql', version: '1.1' },
      }));
    });

    it('should pass baseIRI to query engine context', async() => {
      mockQueryEngine.query.mockResolvedValue({});
      mockQueryEngine.resultToString.mockResolvedValue({
        data: Readable.from([ 'RESULT' ]),
      });

      await toolExecuteCallbackRdf(
        {
          query: 'SELECT * WHERE { ?s ?p ?o }',
          value: '<s> <p> <o>.',
          mediaType: 'text/turtle',
          baseIRI: 'http://query.example.org/',
        },
        ctx,
      );

      expect(mockQueryEngine.query).toHaveBeenCalledWith('SELECT * WHERE { ?s ?p ?o }', expect.objectContaining({
        baseIRI: 'http://query.example.org/',
      }));
    });

    it('should pass fileBaseIRI, baseIRI and queryFormat to query engine', async() => {
      mockQueryEngine.query.mockResolvedValue({});
      mockQueryEngine.resultToString.mockResolvedValue({
        data: Readable.from([ 'RESULT' ]),
      });

      await toolExecuteCallbackRdf(
        {
          query: 'SELECT * WHERE { ?s ?p ?o }',
          value: '<s> <p> <o>.',
          mediaType: 'text/turtle',
          fileBaseIRI: 'http://example.org/',
          baseIRI: 'http://query.example.org/',
          queryFormatLanguage: 'sparql',
          queryFormatVersion: '1.2',
        },
        ctx,
      );

      // FileBaseIRI should be in the source, baseIRI should be in the context
      expect(mockQueryEngine.query).toHaveBeenCalledWith('SELECT * WHERE { ?s ?p ?o }', expect.objectContaining({
        sources: [ expect.objectContaining({
          baseIRI: 'http://example.org/',
        }) ],
        baseIRI: 'http://query.example.org/',
        queryFormat: { language: 'sparql', version: '1.2' },
      }));
    });
  });
});
