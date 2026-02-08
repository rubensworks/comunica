import { Readable } from 'node:stream';
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

  beforeEach(() => {
    // Reset mocks
    mockAddTool.mockClear();
    mockStart.mockClear();
    mockQueryEngine.query.mockClear();
    mockQueryEngine.resultToString.mockClear();

    server = new SparqlMcpServer(3000, <QueryEngineBase> <unknown> mockQueryEngine, '1.2.3');
  });

  describe('start', () => {
    it('should start FastMCP server on specified port', async() => {
      await server.start();

      expect(mockStart).toHaveBeenCalledWith({
        transportType: 'httpStream',
        httpStream: {
          port: 3000,
          stateless: true,
        },
      });
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
      mockQueryEngine.resultToString.mockResolvedValue({
        data: Readable.from([ 'RESULT' ]),
      });
      const result = await toolExecuteCallback(
        { query: 'SELECT *', sources: [ 'http://ex.org' ]},
        ctx,
      );
      expect(mockQueryEngine.query).toHaveBeenCalledWith('SELECT *', {
        sources: [ 'http://ex.org' ],
      });
      expect(result).toBe('RESULT');
    });

    it('should handle query errors', async() => {
      mockQueryEngine.query.mockRejectedValue(new Error('Query failed'));

      const result = await toolExecuteCallback({ query: 'BAD', sources: []}, ctx);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Query failed');
    });
  });
});
