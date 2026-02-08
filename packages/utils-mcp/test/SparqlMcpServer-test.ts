import { Readable, Writable } from 'node:stream';
import type { QueryEngineBase } from '@comunica/actor-init-query';
import type { Context, FastMCPSessionAuth } from 'fastmcp';
import { SparqlMcpServer } from '../lib/SparqlMcpServer';

jest.mock('fastmcp');

// Mock FastMCP with a factory that doesn't import the actual module
const mockAddTool = jest.fn();
const mockStart = jest.fn().mockResolvedValue(undefined);
let toolExecuteCallback: any;

jest.mock<typeof import('fastmcp')>('fastmcp', () => (<any> {
  FastMCP: jest.fn().mockImplementation(() => ({
    addTool: (config: any) => {
      mockAddTool(config);
      // Capture the execute callback for testing
      toolExecuteCallback = config.execute;
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
        process.stderr,
      );
      await defaultServer.start();

      // Should not throw error - successfully using process.stderr
      expect(mockStart).toHaveBeenCalledWith(expect.objectContaining({
        transportType: 'httpStream',
      }));
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
  });

  describe('query_sparql tool logic', () => {
    let ctx: Context<FastMCPSessionAuth>;
    beforeEach(() => {
      ctx = <any> {
        streamContent: jest.fn(),
      };
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
});
