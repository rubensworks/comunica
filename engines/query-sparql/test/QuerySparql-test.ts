/** @jest-environment setup-polly-jest/jest-environment-node */

import { QuerySourceSkolemized } from '@comunica/actor-context-preprocess-query-source-skolemize';
import { KeysHttpWayback, KeysInitQuery, KeysQuerySourceIdentify } from '@comunica/context-entries';
import type { QueryBindings, QueryStringContext } from '@comunica/types';
import type { Bindings } from '@comunica/utils-bindings-factory';
import { BindingsFactory } from '@comunica/utils-bindings-factory';
import { BlankNodeScoped } from '@comunica/utils-data-factory';
import { stringify as stringifyStream } from '@jeswr/stream-to-string';
import type * as RDF from '@rdfjs/types';
import arrayifyStream from 'arrayify-stream';
import 'jest-rdf';
import '@comunica/utils-jest';
import { Store } from 'n3';
import { DataFactory } from 'rdf-data-factory';
import { Factory } from 'sparqlalgebrajs';
import { QueryEngine } from '../lib/QueryEngine';
import { fetch as cachedFetch } from './util';

const DF = new DataFactory();
const BF = new BindingsFactory(DF);
const factory = new Factory();

globalThis.fetch = cachedFetch;

describe('System test: QuerySparql', () => {
  let engine: QueryEngine;
  beforeAll(() => {
    engine = new QueryEngine();
  });

  describe('instantiated multiple times', () => {
    it('should contain different actors', () => {
      const engine2 = new QueryEngine();

      expect((<any> engine).actorInitQuery).toBe((<any> engine).actorInitQuery);
      expect((<any> engine2).actorInitQuery).toBe((<any> engine2).actorInitQuery);
      expect((<any> engine).actorInitQuery).not.toBe((<any> engine2).actorInitQuery);
    });
  });

  describe('query', () => {
    describe('simple SPO on a raw RDF document', () => {
      it('with results', async() => {
        const result = <QueryBindings> await engine.query(`SELECT * WHERE {
      ?s ?p ?o.
    }`, { sources: [ 'https://www.rubensworks.net/' ]});
        expect((await arrayifyStream(await result.execute())).length).toBeGreaterThan(100);
      });

      it('without results', async() => {
        const result = <QueryBindings> await engine.query(`SELECT * WHERE {
      ?s <ex:dummy> ?o.
    }`, { sources: [ 'https://www.rubensworks.net/' ]});
        await expect((arrayifyStream(await result.execute()))).resolves.toEqual([]);
      });

      it('for the single source context entry', async() => {
        const result = <QueryBindings> await engine.query(`SELECT * WHERE {
      ?s ?p ?o.
    }`, { sources: [ 'https://www.rubensworks.net/' ]});
        expect((await arrayifyStream(await result.execute())).length).toBeGreaterThan(100);
      });

      it('repeated with the same engine', async() => {
        const query = `SELECT * WHERE {
      ?s ?p ?o.
    }`;
        const context: QueryStringContext = { sources: [ 'https://www.rubensworks.net/' ]};
        expect((await arrayifyStream(await (<QueryBindings> await engine.query(query, context)).execute()))
          .length).toBeGreaterThan(100);
        expect((await arrayifyStream(await (<QueryBindings> await engine.query(query, context)).execute()))
          .length).toBeGreaterThan(100);
        expect((await arrayifyStream(await (<QueryBindings> await engine.query(query, context)).execute()))
          .length).toBeGreaterThan(100);
        expect((await arrayifyStream(await (<QueryBindings> await engine.query(query, context)).execute()))
          .length).toBeGreaterThan(100);
        expect((await arrayifyStream(await (<QueryBindings> await engine.query(query, context)).execute()))
          .length).toBeGreaterThan(100);
      });

      it('repeated with the same engine without results', async() => {
        const query = `SELECT * WHERE {
      ?s <ex:dummy> ?o.
    }`;
        const context: QueryStringContext = { sources: [ 'https://www.rubensworks.net/' ]};
        await expect((arrayifyStream(await (<QueryBindings> await engine.query(query, context)).execute()))).resolves
          .toEqual([]);
        await expect((arrayifyStream(await (<QueryBindings> await engine.query(query, context)).execute()))).resolves
          .toEqual([]);
        await expect((arrayifyStream(await (<QueryBindings> await engine.query(query, context)).execute()))).resolves
          .toEqual([]);
        await expect((arrayifyStream(await (<QueryBindings> await engine.query(query, context)).execute()))).resolves
          .toEqual([]);
        await expect((arrayifyStream(await (<QueryBindings> await engine.query(query, context)).execute()))).resolves
          .toEqual([]);
      });

      describe('string source query', () => {
        const query = 'CONSTRUCT WHERE { ?s ?p ?o }';
        const value = `{
          "@id":"ex:s",
          "ex:p":{"@id":"ex:o"},
          "ex:p2":{"@id":"ex:o2"}
        }
        `;
        const value2 = '<ex:s> <ex:p3> <ex:o3>. <ex:s> <ex:p4> <ex:o4>.';
        const expectedResult: RDF.Quad[] = [
          DF.quad(DF.namedNode('ex:s'), DF.namedNode('ex:p'), DF.namedNode('ex:o')),
          DF.quad(DF.namedNode('ex:s'), DF.namedNode('ex:p2'), DF.namedNode('ex:o2')),
        ];

        it('should return the valid result with a turtle data source', async() => {
          const turtleValue = '<ex:s> <ex:p> <ex:o>. <ex:s> <ex:p2> <ex:o2>.';
          const context: QueryStringContext = { sources: [
            { type: 'serialized', value: turtleValue, mediaType: 'text/turtle', baseIRI: 'http://example.org/' },
          ]};

          const result = await arrayifyStream(await engine.queryQuads(query, context));
          expect(result).toHaveLength(expectedResult.length);
          expect(result).toMatchObject(expectedResult);
        });

        it('should return the valid result with a json-ld data source', async() => {
          const context: QueryStringContext = { sources: [
            { type: 'serialized', value, mediaType: 'application/ld+json', baseIRI: 'http://example.org/' },
          ]};

          const result = await arrayifyStream(await engine.queryQuads(query, context));
          expect(result).toHaveLength(expectedResult.length);
          expect(result).toMatchObject(expectedResult);
        });

        it('should return the valid result with no base IRI', async() => {
          const context: QueryStringContext = { sources: [
            { type: 'serialized', value, mediaType: 'application/ld+json' },
          ]};

          const result = await arrayifyStream(await engine.queryQuads(query, context));
          expect(result).toHaveLength(expectedResult.length);
          expect(result).toMatchObject(expectedResult);
        });

        it('should return the valid result with multiple serialized', async() => {
          const context: QueryStringContext = { sources: [
            { type: 'serialized', value, mediaType: 'application/ld+json' },
            { type: 'serialized', value: value2, mediaType: 'text/turtle' },
          ]};

          const expectedResult: RDF.Quad[] = [
            DF.quad(DF.namedNode('ex:s'), DF.namedNode('ex:p'), DF.namedNode('ex:o')),
            DF.quad(DF.namedNode('ex:s'), DF.namedNode('ex:p3'), DF.namedNode('ex:o3')),
            DF.quad(DF.namedNode('ex:s'), DF.namedNode('ex:p2'), DF.namedNode('ex:o2')),
            DF.quad(DF.namedNode('ex:s'), DF.namedNode('ex:p4'), DF.namedNode('ex:o4')),
          ];

          const result = await arrayifyStream(await engine.queryQuads(query, context));
          expect(result).toHaveLength(expectedResult.length);
          expect(result).toMatchObject(expectedResult);
        });

        it('should return the valid result with multiple sources', async() => {
          const quads = [
            DF.quad(DF.namedNode('ex:s'), DF.namedNode('ex:p5'), DF.namedNode('ex:o5')),
          ];
          const store = new Store();
          store.addQuads(quads);

          const context: QueryStringContext = { sources: [
            { type: 'serialized', value, mediaType: 'application/ld+json' },
            { type: 'serialized', value: value2, mediaType: 'text/turtle' },
            store,
          ]};
          await expect(arrayifyStream(await engine.queryQuads(query, context))).resolves.toBeRdfIsomorphic([
            DF.quad(DF.namedNode('ex:s'), DF.namedNode('ex:p'), DF.namedNode('ex:o')),
            DF.quad(DF.namedNode('ex:s'), DF.namedNode('ex:p3'), DF.namedNode('ex:o3')),
            DF.quad(DF.namedNode('ex:s'), DF.namedNode('ex:p5'), DF.namedNode('ex:o5')),
            DF.quad(DF.namedNode('ex:s'), DF.namedNode('ex:p2'), DF.namedNode('ex:o2')),
            DF.quad(DF.namedNode('ex:s'), DF.namedNode('ex:p4'), DF.namedNode('ex:o4')),
          ]);
        });

        it('should serialise results correctly', async() => {
          const context: QueryStringContext = { sources: [
            { type: 'serialized', value, mediaType: 'application/ld+json', baseIRI: 'http://example.org/' },
          ]};

          const resultString = await engine.resultToString(await engine.query(query, context), 'application/n-quads');
          await expect(stringifyStream(resultString.data)).resolves.toBe(
            '<ex:s> <ex:p> <ex:o> .\n<ex:s> <ex:p2> <ex:o2> .\n',
          );
        });

        it('should have stats that are strictly increasing', async() => {
          const context: QueryStringContext = {
            sources: [
              { type: 'serialized', value, mediaType: 'application/ld+json', baseIRI: 'http://example.org/' },
            ],
            [KeysInitQuery.queryTimestampHighResolution.name]: performance.now(),
          };

          const resultString: string = await stringifyStream(
            (await engine.resultToString(await engine.query(query, context), 'stats', context)).data,
          );
          const times = resultString.split('\n').slice(1, -1).map(line => Number.parseFloat(line.split(',')[1]));
          expect(times).toHaveLength(4);
          for (let i = 0; i < 2; i++) {
            expect(times[i]).toBeLessThanOrEqual(times[i + 1]);
          }
        });
      });

      describe('handle blank nodes with DESCRIBE queries', () => {
        let store: Store;
        let quads: RDF.Quad[];
        const query = `DESCRIBE ?o  {
          ?s ?p ?o .
      }`;

        beforeEach(() => {
          store = new Store();
        });

        it('return consistent blank nodes with a data source that should return one blank node', async() => {
          quads = [
            DF.quad(DF.namedNode('a'), DF.namedNode('b'), DF.namedNode('c')),

            DF.quad(DF.namedNode('a'), DF.namedNode('d'), DF.blankNode('e')),

            DF.quad(DF.blankNode('e'), DF.namedNode('f'), DF.namedNode('g')),
            DF.quad(DF.blankNode('e'), DF.namedNode('h'), DF.namedNode('i')),
          ];
          store.addQuads(quads);
          const context = <any> { sources: [ store ]};

          const blankNode = new BlankNodeScoped('bc_0_e', DF.namedNode('urn:comunica_skolem:source_0:e'));
          const expectedResult = [
            DF.quad(blankNode, DF.namedNode('f'), DF.namedNode('g')),
            DF.quad(blankNode, DF.namedNode('h'), DF.namedNode('i')),
          ];

          const result = await arrayifyStream(await (<QueryBindings> await engine.query(query, context)).execute());

          expect(result).toHaveLength(expectedResult.length);
          expect(result).toMatchObject(expectedResult);
        });

        it('return consistent blank nodes with a data source that should return multiple blank nodes', async() => {
          quads = [
            DF.quad(DF.namedNode('a'), DF.namedNode('b'), DF.namedNode('c')),

            DF.quad(DF.namedNode('a'), DF.namedNode('d'), DF.blankNode('e')),
            DF.quad(DF.namedNode('a'), DF.namedNode('d'), DF.blankNode('j')),
            DF.quad(DF.namedNode('a'), DF.namedNode('d'), DF.blankNode('k')),

            DF.quad(DF.blankNode('e'), DF.namedNode('f'), DF.namedNode('g')),
            DF.quad(DF.blankNode('e'), DF.namedNode('h'), DF.namedNode('i')),
            DF.quad(DF.blankNode('j'), DF.namedNode('f'), DF.namedNode('g')),
            DF.quad(DF.blankNode('j'), DF.namedNode('h'), DF.namedNode('i')),
            DF.quad(DF.blankNode('k'), DF.namedNode('f'), DF.namedNode('g')),
            DF.quad(DF.blankNode('k'), DF.namedNode('h'), DF.namedNode('i')),
          ];
          store.addQuads(quads);
          const context = <any> { sources: [ store ]};

          const blankNodeE = new BlankNodeScoped('bc_0_e', DF.namedNode('urn:comunica_skolem:source_0:e'));
          const blankNodeJ = new BlankNodeScoped('bc_0_j', DF.namedNode('urn:comunica_skolem:source_0:j'));
          const blankNodeK = new BlankNodeScoped('bc_0_k', DF.namedNode('urn:comunica_skolem:source_0:k'));
          const expectedResult = [
            DF.quad(blankNodeE, DF.namedNode('f'), DF.namedNode('g')),
            DF.quad(blankNodeE, DF.namedNode('h'), DF.namedNode('i')),
            DF.quad(blankNodeJ, DF.namedNode('f'), DF.namedNode('g')),
            DF.quad(blankNodeJ, DF.namedNode('h'), DF.namedNode('i')),
            DF.quad(blankNodeK, DF.namedNode('f'), DF.namedNode('g')),
            DF.quad(blankNodeK, DF.namedNode('h'), DF.namedNode('i')),
          ];

          const result = await arrayifyStream(await (<QueryBindings> await engine.query(query, context)).execute());

          expect(result).toHaveLength(expectedResult.length);
          expect(result).toMatchObject(expectedResult);
        });

        it('return consistent blank nodes with a data source containing a nested blank node', async() => {
          quads = [
            DF.quad(DF.namedNode('a'), DF.namedNode('b'), DF.namedNode('c')),

            DF.quad(DF.namedNode('a'), DF.namedNode('d'), DF.blankNode('e')),

            DF.quad(DF.blankNode('e'), DF.namedNode('f'), DF.blankNode('g')),
            DF.quad(DF.blankNode('e'), DF.namedNode('h'), DF.namedNode('i')),

            DF.quad(DF.blankNode('g'), DF.namedNode('i'), DF.namedNode('j')),
          ];
          store.addQuads(quads);
          const context = <any> { sources: [ store ]};

          const blankNodeE = new BlankNodeScoped('bc_0_e', DF.namedNode('urn:comunica_skolem:source_0:e'));
          const blankNodeG = new BlankNodeScoped('bc_0_g', DF.namedNode('urn:comunica_skolem:source_0:g'));
          const expectedResult = [
            DF.quad(blankNodeE, DF.namedNode('f'), blankNodeG),
            DF.quad(blankNodeE, DF.namedNode('h'), DF.namedNode('i')),

            DF.quad(blankNodeG, DF.namedNode('i'), DF.namedNode('j')),
          ];

          const result = await arrayifyStream(await (<QueryBindings> await engine.query(query, context)).execute());

          expect(result).toHaveLength(expectedResult.length);
          expect(result).toMatchObject(expectedResult);
        });

        it(`return consistent blank nodes with a data source that should return one blank node and one named node`, async() => {
          quads = [
            DF.quad(DF.namedNode('a'), DF.namedNode('b'), DF.namedNode('c')),

            DF.quad(DF.namedNode('a'), DF.namedNode('d'), DF.blankNode('e')),

            DF.quad(DF.blankNode('e'), DF.namedNode('f'), DF.namedNode('g')),
            DF.quad(DF.blankNode('e'), DF.namedNode('h'), DF.namedNode('i')),

            DF.quad(DF.namedNode('c'), DF.namedNode('i'), DF.namedNode('j')),
          ];
          store.addQuads(quads);
          const context = <any> { sources: [ store ]};

          const blankNode = new BlankNodeScoped('bc_0_e', DF.namedNode('urn:comunica_skolem:source_0:e'));
          const expectedResult = [
            DF.quad(DF.namedNode('c'), DF.namedNode('i'), DF.namedNode('j')),
            DF.quad(blankNode, DF.namedNode('f'), DF.namedNode('g')),
            DF.quad(blankNode, DF.namedNode('h'), DF.namedNode('i')),
          ];

          const result = await arrayifyStream(await (<QueryBindings> await engine.query(query, context)).execute());

          expect(result).toHaveLength(expectedResult.length);
          expect(result).toMatchObject(expectedResult);
        });
      });

      describe('extension function', () => {
        let funcAllow: string;
        let store: Store;
        let baseFunctions: Record<string, (args: RDF.Term[]) => Promise<RDF.Term>>;
        let baseFunctionCreator: (functionName: RDF.NamedNode) => ((args: RDF.Term[]) => Promise<RDF.Term>) | undefined;
        let quads: RDF.Quad[];
        let stringType: RDF.NamedNode;
        let booleanType: RDF.NamedNode;
        let integerType: RDF.NamedNode;
        beforeEach(() => {
          stringType = DF.namedNode('http://www.w3.org/2001/XMLSchema#string');
          booleanType = DF.namedNode('http://www.w3.org/2001/XMLSchema#boolean');
          integerType = DF.namedNode('http://www.w3.org/2001/XMLSchema#integer');
          funcAllow = 'allowAll';
          baseFunctions = {
            'http://example.org/functions#allowAll': async() => DF.literal('true', booleanType),
          };
          baseFunctionCreator = () => async() => DF.literal('true', booleanType);
          store = new Store();
          quads = [
            DF.quad(DF.namedNode('ex:a'), DF.namedNode('ex:p1'), DF.literal('apple', stringType)),
            DF.quad(DF.namedNode('ex:a'), DF.namedNode('ex:p2'), DF.literal('APPLE', stringType)),
            DF.quad(DF.namedNode('ex:a'), DF.namedNode('ex:p3'), DF.literal('Apple', stringType)),
            DF.quad(DF.namedNode('ex:a'), DF.namedNode('ex:p4'), DF.literal('aPPLE', stringType)),
          ];
          store.addQuads(quads);
        });
        const baseQuery = (funcName: string) => `PREFIX func: <http://example.org/functions#>
        SELECT * WHERE {
              ?s ?p ?o.
            FILTER (func:${funcName}(?o))
        }`;

        it('rejects when record does not match', async() => {
          const context = <any> { sources: [ store ]};
          context.extensionFunctions = baseFunctions;
          await expect(engine.query(baseQuery('nonExist'), context)).rejects.toThrow(
            `Creation of function evaluator failed: no configured actor was able to evaluate function http://example.org/functions#nonExist`,
          );
        });

        it('rejects when creator returns null', async() => {
          const context = <any> { sources: [ store ]};
          context.extensionFunctionCreator = () => null;
          await expect(engine.query(baseQuery('nonExist'), context)).rejects.toThrow(
            `Creation of function evaluator failed: no configured actor was able to evaluate function http://example.org/functions#nonExist`,
          );
        });

        it('with results and pointless custom filter given by creator', async() => {
          const context = <any> { sources: [ store ]};
          context.extensionFunctionCreator = baseFunctionCreator;
          const result = <QueryBindings> await engine.query(baseQuery(funcAllow), context);
          await expect((arrayifyStream(await result.execute()))).resolves.toHaveLength(store.size);
        });

        it('with results and pointless custom filter given by record', async() => {
          const context = <any> { sources: [ store ]};
          context.extensionFunctions = baseFunctions;
          const result = <QueryBindings> await engine.query(baseQuery(funcAllow), context);
          await expect((arrayifyStream(await result.execute()))).resolves.toHaveLength(4);
        });

        it('with results but all filtered away', async() => {
          const context = <any> { sources: [ store ]};
          context.extensionFunctionCreator = () => () =>
            DF.literal('false', booleanType);
          const result = <QueryBindings> await engine.query(baseQuery('rejectAll'), context);
          await expect(arrayifyStream(await result.execute())).resolves.toEqual([]);
        });

        it('throws error when supplying both record and creator', async() => {
          const context = <any> { sources: [ store ]};
          context.extensionFunctions = baseFunctions;
          context.extensionFunctionCreator = baseFunctionCreator;
          await expect(engine.query(baseQuery(funcAllow), context)).rejects
            .toThrow('Illegal simultaneous usage of extensionFunctionCreator and extensionFunctions in context');
        });

        it('handles complex queries with BIND to', async() => {
          const context = <any> { sources: [ store ]};
          const complexQuery = `PREFIX func: <http://example.org/functions#>
        SELECT ?caps WHERE {
              ?s ?p ?o.
              BIND (func:to-upper-case(?o) AS ?caps)
        }
          `;
          context.extensionFunctions = {
            'http://example.org/functions#to-upper-case': async function(args: RDF.Term[]) {
              const arg = args[0];
              if (arg.termType === 'Literal' && arg.datatype.equals(DF.literal('', stringType).datatype)) {
                return DF.literal(arg.value.toUpperCase(), stringType);
              }
              return arg;
            },
          };
          const bindingsStream = await engine.queryBindings(complexQuery, context);
          expect((await bindingsStream.toArray()).map(res => res.get(DF.variable('caps'))!.value)).toEqual(
            quads.map(q => q.object.value.toUpperCase()),
          );
        });

        describe('handles complex queries with groupBy', () => {
          let context: any;
          let complexQuery: string;
          let extensionBuilder: (timout: boolean) => (args: RDF.Term[]) => Promise<RDF.Term>;

          beforeEach(() => {
            context = <any> { sources: [ store ]};
            complexQuery = `PREFIX func: <http://example.org/functions#>
        SELECT (SUM(func:count-chars(?o)) AS ?sum) WHERE {
              ?s ?p ?o.
        }
          `;
            extensionBuilder = (timout: boolean) => async(args: RDF.Term[]) => {
              const arg = args[0];
              if (arg.termType === 'Literal' && arg.datatype.equals(DF.literal('', stringType).datatype)) {
                if (timout) {
                  await new Promise(resolve => setTimeout(resolve, 1));
                }
                return DF.literal(String(arg.value.length), integerType);
              }
              return arg;
            };
          });

          it('can be evaluated', async() => {
            context.extensionFunctions = {
              'http://example.org/functions#count-chars': extensionBuilder(false),
            };
            const bindingsStream = await engine.queryBindings(complexQuery, context);
            expect((await bindingsStream.toArray()).map(res => res.get(DF.variable('sum'))!.value)).toEqual([ '20' ]);
          });

          it('can be truly async', async() => {
            context.extensionFunctions = {
              'http://example.org/functions#count-chars': extensionBuilder(true),
            };
            const bindingsStream = await engine.queryBindings(complexQuery, context);
            expect((await bindingsStream.toArray()).map(res => res.get(DF.variable('sum'))!.value)).toEqual([ '20' ]);
          });
        });
      });

      describe('functionArgumentsCache', () => {
        let query: string;
        let stringType: RDF.NamedNode;
        let quads: RDF.Quad[];
        let store: Store;
        beforeAll(() => {
          // The query provided is completely arbitrary and should not change the results of this test
          // besides the value in the cache.
          query = `SELECT (strlen(?x) AS ?len) WHERE {
            ?s ?p ?x
          }
          `;
          stringType = DF.namedNode('http://www.w3.org/2001/XMLSchema#string');
          store = new Store();
          quads = [
            DF.quad(DF.namedNode(':a'), DF.namedNode(':p'), DF.literal('apple', stringType)),
          ];
          store.addQuads(quads);
        });

        it('is used when provided', async() => {
          const context = <any> { sources: [ store ]};
          const functionArgumentsCache = {};
          context.functionArgumentsCache = functionArgumentsCache;

          const bindingsStream = await engine.queryBindings(query, context);
          expect((await bindingsStream.toArray()).map(res => res.get(DF.variable('len'))!.value)).toEqual(
            quads.map(q => String(q.object.value.length)),
          );
          expect(Object.keys(functionArgumentsCache)).toContain('strlen');
        });
      });
    });

    describe('simple SPS', () => {
      it('Raw Source', async() => {
        const result = <QueryBindings> await engine.query(`SELECT * WHERE {
      ?s ?p ?s.
    }`, { sources: [ 'https://www.rubensworks.net/' ]});
        await expect(((arrayifyStream(await result.execute())))).resolves.toHaveLength(1);
      });

      it('RDFJS Source', async() => {
        const store = new Store([
          DF.quad(DF.namedNode('s'), DF.namedNode('p'), DF.namedNode('s')),
          DF.quad(DF.namedNode('l'), DF.namedNode('m'), DF.namedNode('n')),
        ]);
        const result = <QueryBindings> await engine.query(`SELECT * WHERE {
      ?s ?p ?s.
    }`, { sources: [ store ]});
        await expect((arrayifyStream(await result.execute()))).resolves.toHaveLength(1);
      });
    });

    describe('two-pattern query on a raw RDF document', () => {
      it('with results', async() => {
        const result = <QueryBindings> await engine.query(`SELECT ?name WHERE {
  <https://www.rubensworks.net/#me> <http://xmlns.com/foaf/0.1/knows> ?v0.
  ?v0 <http://xmlns.com/foaf/0.1/name> ?name.
    }`, { sources: [ 'https://www.rubensworks.net/' ]});
        expect((await arrayifyStream(await result.execute())).length).toBeGreaterThan(20);
      });

      it('without results', async() => {
        const result = <QueryBindings> await engine.query(`SELECT ?name WHERE {
  <https://www.rubensworks.net/#me> <http://xmlns.com/foaf/0.1/knows> ?v0.
  ?v0 <ex:dummy> ?name.
    }`, { sources: [ 'https://www.rubensworks.net/' ]});
        await expect((arrayifyStream(await result.execute()))).resolves.toEqual([]);
      });

      it('for the single source entry', async() => {
        const result = <QueryBindings> await engine.query(`SELECT ?name WHERE {
  <https://www.rubensworks.net/#me> <http://xmlns.com/foaf/0.1/knows> ?v0.
  ?v0 <http://xmlns.com/foaf/0.1/name> ?name.
    }`, { sources: [ 'https://www.rubensworks.net/' ]});
        expect((await arrayifyStream(await result.execute())).length).toBeGreaterThan(20);
      });

      describe('SHACL Compact Syntax Serialisation', () => {
        it('handles the query with SHACL compact syntax as a source', async() => {
          const result = <QueryBindings> await engine.query(`SELECT * WHERE {
    ?s a <http://www.w3.org/2002/07/owl#Ontology>.
  }`, { sources: [
            'https://raw.githubusercontent.com/w3c/data-shapes/gh-pages/shacl-compact-syntax/' +
          'tests/valid/basic-shape-iri.shaclc',
          ]});
          await expect((arrayifyStream(await result.execute()))).resolves.toHaveLength(1);
        });

        it('correctly serializes construct query on a shape in .shaclc as shaclc', async() => {
          const result = <QueryBindings> await engine.query(`CONSTRUCT WHERE {
    ?s ?p ?o
  }`, { sources: [
            'https://raw.githubusercontent.com/w3c/data-shapes/gh-pages/shacl-compact-syntax/' +
          'tests/valid/basic-shape-iri.shaclc',
          ]});

          const { data } = await engine.resultToString(result, 'text/shaclc');

          await expect((stringifyStream(data))).resolves.toEqual('BASE <http://example.org/basic-shape-iri>\n\n' +
    'shape <http://example.org/test#TestShape> {\n' +
    '}\n');
        });

        it('correctly serializes construct query on a shape in .ttl as shaclc', async() => {
          const result = <QueryBindings> await engine.query(`CONSTRUCT WHERE {
    ?s ?p ?o
  }`, { sources: [
            'https://raw.githubusercontent.com/w3c/data-shapes/gh-pages/shacl-compact-syntax/' +
          'tests/valid/basic-shape-iri.ttl',
          ]});

          const { data } = await engine.resultToString(result, 'text/shaclc');

          await expect((stringifyStream(data))).resolves.toEqual('BASE <http://example.org/basic-shape-iri>\n\n' +
    'shape <http://example.org/test#TestShape> {\n' +
    '}\n');
        });
      });
    });

    describe('simple SPO on a TPF entrypoint', () => {
      it('with results', async() => {
        const result = <QueryBindings> await engine.query(`SELECT * WHERE {
      ?s ?p ?o.
    } LIMIT 300`, { sources: [ 'https://fragments.dbpedia.org/2016-04/en' ]});
        await expect((arrayifyStream(await result.execute()))).resolves.toHaveLength(300);
        await new Promise(resolve => setTimeout(resolve, 10)); // To avoid unhandled errors
      });

      it('with filtered results', async() => {
        const result = <QueryBindings> await engine.query(`SELECT * WHERE {
      ?s a ?o.
    } LIMIT 300`, { sources: [ 'https://fragments.dbpedia.org/2016-04/en' ]});
        await expect((arrayifyStream(await result.execute()))).resolves.toHaveLength(300);
        await new Promise(resolve => setTimeout(resolve, 10)); // To avoid unhandled errors
      });
    });

    describe('two-pattern query on a TPF entrypoint', () => {
      it('with results', async() => {
        const result = <QueryBindings> await engine.query(`SELECT * WHERE {
      ?city a <http://dbpedia.org/ontology/Airport>;
            <http://dbpedia.org/property/cityServed> <http://dbpedia.org/resource/Italy>.
    }`, { sources: [ 'https://fragments.dbpedia.org/2016-04/en' ]});
        await expect((arrayifyStream(await result.execute()))).resolves.toHaveLength(19);
      });

      it('without results', async() => {
        const result = <QueryBindings> await engine.query(`SELECT * WHERE {
      ?city a <http://dbpedia.org/ontology/Airport>;
            <http://dbpedia.org/property/cityServed> <http://dbpedia.org/resource/UNKNOWN>.
    }`, { sources: [ 'https://fragments.dbpedia.org/2016-04/en' ]});
        await expect((arrayifyStream(await result.execute()))).resolves.toEqual([]);
      });
    });

    describe('left join with an optional', () => {
      it('should handle filters inside the optional block', async() => {
        const store = new Store();

        store.addQuad(
          DF.namedNode('http://ex.org/Pluto'),
          DF.namedNode('http://ex.org/type'),
          DF.namedNode('http://ex.org/Dog'),
        );
        store.addQuad(
          DF.namedNode('http://ex.org/Mickey'),
          DF.namedNode('http://ex.org/name'),
          DF.literal('Lorem ipsum', 'nl'),
        );

        const result = <QueryBindings> await engine.query(`
        SELECT * WHERE { 
          ?s ?p ?o .
      
          OPTIONAL {
            ?s <http://ex.org/name> ?name .
            FILTER(lang(?name) = 'nl')
          }
        }`, { sources: [ store ]});

        const expectedResult: Bindings[] = [
          BF.bindings([
            [ DF.variable('s'), DF.namedNode('http://ex.org/Pluto') ],
            [ DF.variable('p'), DF.namedNode('http://ex.org/type') ],
            [ DF.variable('o'), DF.namedNode('http://ex.org/Dog') ],
          ]),
          BF.bindings([
            [ DF.variable('name'), DF.literal('Lorem ipsum', 'nl') ],
            [ DF.variable('s'), DF.namedNode('http://ex.org/Mickey') ],
            [ DF.variable('p'), DF.namedNode('http://ex.org/name') ],
            [ DF.variable('o'), DF.literal('Lorem ipsum', 'nl') ],
          ]),
        ];

        await expect(result.execute()).resolves.toEqualBindingsStream(expectedResult);
      });

      it('should handle join with empty estimate cardinality', async() => {
        const context: QueryStringContext = {
          sources: [
            {
              type: 'serialized',
              value: `
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix ex: <http://example.org/> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
ex:personA a ex:Person.
#ex:personA ex:hasName "Homer".
`,
              mediaType: 'text/turtle',
              baseIRI: 'http://example.org/',
            },
          ],
        };

        await expect((arrayifyStream(await engine.queryBindings(`
PREFIX ex: <http://example.org/>
SELECT ?person ?personName WHERE {
    OPTIONAL {
        ?person ex:hasName ?personName
    }
    ?person a ex:Person
}
`, context)))).resolves.toHaveLength(1);
      });
    });

    describe('with a throwing fetch function', () => {
      function throwingFetch() {
        throw new Error('Fetch failed!');
      }

      it('should throw when querying once', async() => {
        await expect(engine.query(`
        SELECT ?s ?p ?o WHERE { ?s ?p ?o }`, {
          sources: [ 'https://my.failing.url' ],
          fetch: <any> throwingFetch,
        })).rejects.toThrow('Fetch failed!');
      });

      it('should throw when querying twice', async() => {
        await expect(engine.query(`
        SELECT ?s ?p ?o WHERE { ?s ?p ?o }`, {
          sources: [ 'https://my.failing.url' ],
          fetch: <any> throwingFetch,
        })).rejects.toThrow('Fetch failed!');

        await expect(engine.query(`
        SELECT ?s ?p ?o WHERE { ?s ?p ?o }`, {
          sources: [ 'https://my.failing.url' ],
          fetch: <any> throwingFetch,
        })).rejects.toThrow('Fetch failed!');
      });
    });

    describe('on a remote source', () => {
      it('with non-matching query with limit and filter', async() => {
        const bindingsStream = await engine.queryBindings(`
SELECT * WHERE {
  ?s ?p <http://purl.org/dc/terms/dontExist>
  FILTER(?s>1)
} LIMIT 1`, {
          sources: [ 'https://www.rubensworks.net/' ],
        });
        let called = 0;
        const dataListener = () => {
          called++;
        };
        bindingsStream.on('data', dataListener);
        await new Promise((resolve, reject) => {
          bindingsStream.on('error', reject);
          bindingsStream.on('end', resolve);
        });
        expect(called).toBe(0);
      });

      it('with two triple patterns over a paged collection (no browser)', async() => {
        const bindingsStream = await engine.queryBindings(`
SELECT *
WHERE {
  <https://opendata.picturae.com/dataset/dre_a2a_webservice> <http://purl.org/dc/terms/identifier> ?i.
  <https://opendata.picturae.com/dataset/dre_a2a_webservice> <http://purl.org/dc/terms/issued> ?issued.
}`, {
          sources: [ 'https://opendata.picturae.com/catalog.ttl?page=1' ],
        });
        expect((await bindingsStream.toArray()).length > 0).toBeTruthy();
      });

      it('with join over union', async() => {
        const bindingsStream = await engine.queryBindings(`
SELECT * WHERE {
  <https://api.community.hubl.world/skills/> <http://www.w3.org/ns/ldp#contains> ?contains.
  {
    { ?contains <http://www.w3.org/2000/01/rdf-schema#label> ?preload_0. }
    UNION
    { ?contains <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> ?preload_1. }
  }
}`, {
          sources: [ 'https://api.community.hubl.world/skills/' ],
        });
        expect((await bindingsStream.toArray()).length > 0).toBeTruthy();
      });
    });

    describe('property paths', () => {
      it('should handle zero-or-more paths with lists', async() => {
        const context: QueryStringContext = {
          sources: [
            {
              type: 'serialized',
              value: `
PREFIX fhir: <http://hl7.org/fhir/>

<http://hl7.org/fhir/Observation/58671>
  fhir:id [ fhir:v "58671" ];
  fhir:value [
    fhir:coding ( [
      a <http://snomed.info/id/8517006>;
    ] )
  ];
  fhir:component ( [
    fhir:value [
      fhir:coding [] # comment this line
    ];
  ] ).
`,
              mediaType: 'text/turtle',
              baseIRI: 'http://example.org/',
            },
          ],
        };

        await expect((arrayifyStream(await engine.queryBindings(`
PREFIX fhir: <http://hl7.org/fhir/>
SELECT ?obsId {
  ?obs
    fhir:id [ fhir:v ?obsId ].
  ?obs fhir:value [
      fhir:coding [ rdf:rest*/rdf:first [
        a <http://snomed.info/id/8517006> ;
      ] ]
    ].
}
`, context)))).resolves.toHaveLength(1);
      });
    });

    describe('commutative count', () => {
      it('should count commutatively', async() => {
        const context: QueryStringContext = {
          sources: [
            {
              type: 'serialized',
              value: `
              @prefix ex: <http://example.org/> .
            
              <http://foo.org/id/graph/foo> {
                <http://foo.org/id/object/foo>
                  ex:foo ex:Foo ;
                  ex:bar [] ;
                  ex:baz "baz1", "baz2", "baz3" .
              }
              `,
              mediaType: 'text/turtle',
              baseIRI: 'http://example.org/',
            },
          ],
        };

        const expectedResult = [
          [
            [ DF.variable('objects'), DF.literal('1', DF.namedNode('http://www.w3.org/2001/XMLSchema#integer')) ],
            [ DF.variable('p'), DF.namedNode('http://example.org/foo') ],
            [ DF.variable('subjects'), DF.literal('1', DF.namedNode('http://www.w3.org/2001/XMLSchema#integer')) ],
          ],
          [
            [ DF.variable('objects'), DF.literal('1', DF.namedNode('http://www.w3.org/2001/XMLSchema#integer')) ],
            [ DF.variable('p'), DF.namedNode('http://example.org/bar') ],
            [ DF.variable('subjects'), DF.literal('1', DF.namedNode('http://www.w3.org/2001/XMLSchema#integer')) ],
          ],
          [
            [ DF.variable('objects'), DF.literal('3', DF.namedNode('http://www.w3.org/2001/XMLSchema#integer')) ],
            [ DF.variable('p'), DF.namedNode('http://example.org/baz') ],
            [ DF.variable('subjects'), DF.literal('1', DF.namedNode('http://www.w3.org/2001/XMLSchema#integer')) ],
          ],
        ];

        const bindings1 = (await arrayifyStream(await engine.queryBindings(`
        SELECT (COUNT(DISTINCT ?o) as ?objects) (COUNT(DISTINCT ?s) AS ?subjects) ?p
        FROM <http://foo.org/id/graph/foo>
        {
          ?s ?p ?o .
        }
        GROUP BY ?p
        `, context))).map(binding => [ ...binding ].sort(([ var1, _c1 ], [ var2, _c2 ]) => var1.value.localeCompare(var2.value)));

        const bindings2 = (await arrayifyStream(await engine.queryBindings(`
        SELECT (COUNT(DISTINCT ?s) AS ?subjects) (COUNT(DISTINCT ?o) as ?objects) ?p
        FROM <http://foo.org/id/graph/foo>
        {
          ?s ?p ?o .
        }
        GROUP BY ?p
        `, context))).map(binding => [ ...binding ].sort(([ var1, _c1 ], [ var2, _c2 ]) => var1.value.localeCompare(var2.value)));

        expect(bindings1).toMatchObject(expectedResult);
        expect(bindings2).toMatchObject(expectedResult);
      });
    });

    describe('initialBindings', () => {
      let initialBindings: Bindings;
      let sourcesValue1: string;

      beforeEach(() => {
        initialBindings = BF.bindings([
          [ DF.variable('a'), DF.namedNode('http://example.org/test#testBinding') ],
        ]);
        sourcesValue1 = `
          @prefix ex: <http://example.org/test#> .
          
          ex:testBinding
            ex:property "testProperty" .
          `;
      });

      it('should consider the initialbindings in the bound function', async() => {
        const context: QueryStringContext = {
          sources: [
            {
              type: 'serialized',
              value: sourcesValue1,
              mediaType: 'text/turtle',
            },
          ],
          initialBindings,
        };

        const expectedResult: Bindings[] = [
          BF.bindings([
            [ DF.variable('a'), DF.namedNode('http://example.org/test#testBinding') ],
          ]),
        ];

        const bindings = (await engine.queryBindings(`
        PREFIX ex: <http://example.org/test#>
        
        SELECT $a WHERE {
          {
            FILTER (bound($a))
          }
          $a ex:property "testProperty" .
          FILTER (bound($a)) .
        }
          `, context));

        await expect(bindings).toEqualBindingsStream(expectedResult);
      });

      it('should consider the initialbindings in the filter function', async() => {
        const context: QueryStringContext = {
          sources: [
            {
              type: 'serialized',
              value: sourcesValue1,
              mediaType: 'text/turtle',
            },
          ],
          initialBindings,
        };

        const expectedResult: Bindings[] = [
          BF.bindings([
            [ DF.variable('a'), DF.namedNode('http://example.org/test#testBinding') ],
          ]),
        ];

        const bindings = (await engine.queryBindings(`
        PREFIX ex: <http://example.org/test#>
      
        SELECT $a WHERE {
          {
            SELECT * WHERE {
              FILTER ($a = ex:testBinding) .
            }
          }
        }
        `, context));

        await expect(bindings).toEqualBindingsStream(expectedResult);
      });

      it('should consider the initialbindings in the filter function 2', async() => {
        const context: QueryStringContext = {
          sources: [
            {
              type: 'serialized',
              value: sourcesValue1,
              mediaType: 'text/turtle',
            },
          ],
          initialBindings,
        };

        const expectedResult: Bindings[] = [
          BF.bindings([
            [ DF.variable('a'), DF.namedNode('http://example.org/test#testBinding') ],
          ]),
        ];

        const bindings = (await engine.queryBindings(`
        PREFIX ex: <http://example.org/test#>
      
        SELECT $a WHERE {
          {
            SELECT $a WHERE {
              FILTER ($a = ex:testBinding) .
            }
          }
        }
        `, context));

        await expect(bindings).toEqualBindingsStream(expectedResult);
      });

      it('should consider initialbindings which are not projected', async() => {
        const initialBindings = BF.bindings([
          [ DF.variable('predicate'), DF.namedNode('http://example.org/test#predicateEx') ],
          [ DF.variable('subject'), DF.namedNode('http://example.org/test#subjectEx') ],
        ]);

        const context: QueryStringContext = {
          sources: [
            {
              type: 'serialized',
              value: `
                @prefix ex: <http://example.org/test#> .
                @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
                        
                ex:subjectEx
                    rdf:type ex:Type ;
                    ex:predicateEx "Predicate"@de ;
                .`,
              mediaType: 'text/turtle',
            },
          ],
          initialBindings,
        };

        const bindings = (await engine.queryBindings(`
        SELECT $subject ?value WHERE {
          $subject $predicate ?value .
          FILTER (!isLiteral(?value) || !langMatches(lang(?value), "de"))
        }`, context));

        await expect(bindings).toEqualBindingsStream([]);
      });

      it('should consider initialbindings in the extend operation', async() => {
        const initialBindings = BF.bindings([
          [ DF.variable('initialBindingsVariable'), DF.namedNode('http://example.org/test#InitialBindingsValue') ],
        ]);

        const context: QueryStringContext = {
          sources: [
            {
              type: 'serialized',
              value: ``,
              mediaType: 'text/turtle',
            },
          ],
          initialBindings,
        };

        const bindings = (await engine.queryBindings(`
        PREFIX ex: <http://example.org/test#>
        
        SELECT $initialBindingsVariable
        \tWHERE {
        \t\tBIND ($initialBindingsVariable AS ?b) .
        \t\tFILTER (?b = ex:InitialBindingsValue) .
        \t}`, context));

        const expectedResult: Bindings[] = [
          BF.bindings([
            [ DF.variable('initialBindingsVariable'), DF.namedNode('http://example.org/test#InitialBindingsValue') ],
          ]),
        ];

        await expect(bindings).toEqualBindingsStream(expectedResult);
      });

      it('should not overwrite initialbindings', async() => {
        const context: QueryStringContext = {
          sources: [
            {
              type: 'serialized',
              value: ``,
              mediaType: 'text/turtle',
            },
          ],
          initialBindings,
        };

        // Reject for existing graph
        await expect(engine.queryBindings(`
          SELECT $a
          WHERE {
            BIND (true AS $a) .
          }`, context)).rejects.toThrow('Illegal binding to variable \'a\' that has already been bound');
      });
    });
  });

  // We skip these tests in browsers due to CORS issues
  describe('foaf ontology broken link (no browser)', () => {
    it('returns results with link recovery on [using full key]', async() => {
      const result = <QueryBindings> await engine.query(`SELECT * WHERE {
    <http://xmlns.com/foaf/0.1/> a <http://www.w3.org/2002/07/owl#Ontology>.
  }`, {
        sources: [ 'http://xmlns.com/foaf/spec/20140114.rdf' ],
        [KeysHttpWayback.recoverBrokenLinks.name]: true,
      });
      await expect((arrayifyStream(await result.execute()))).resolves.toHaveLength(1);
    });

    it('returns results with link recovery on [using shortcut key]', async() => {
      const result = <QueryBindings> await engine.query(`SELECT * WHERE {
    <http://xmlns.com/foaf/0.1/> a <http://www.w3.org/2002/07/owl#Ontology>.
  }`, { sources: [ 'http://xmlns.com/foaf/spec/20140114.rdf' ], recoverBrokenLinks: true });
      await expect((arrayifyStream(await result.execute()))).resolves.toHaveLength(1);
    });
  });

  describe('update', () => {
    describe('without sources on destination RDFJS Store', () => {
      it('with direct insert', async() => {
        // Prepare store
        const store = new Store();

        // Execute query
        const result = <RDF.QueryVoid> await engine.query(`INSERT DATA {
          <ex:s> <ex:p> <ex:o>.
        }`, {
          sources: [ 'dummy' ],
          destination: store,
        });
        await result.execute();

        // Check store contents
        expect(store.size).toBe(1);
        expect(store.countQuads(DF.namedNode('ex:s'), DF.namedNode('ex:p'), DF.namedNode('ex:o'), DF.defaultGraph()))
          .toBe(1);
      });

      it('with direct insert on a single source', async() => {
        // Prepare store
        const store = new Store();

        // Execute query
        const result = <RDF.QueryVoid> await engine.query(`INSERT DATA {
          <ex:s> <ex:p> <ex:o>.
        }`, {
          sources: [ store ],
        });
        await result.execute();

        // Check store contents
        expect(store.size).toBe(1);
        expect(store.countQuads(DF.namedNode('ex:s'), DF.namedNode('ex:p'), DF.namedNode('ex:o'), DF.defaultGraph()))
          .toBe(1);
      });

      it('with insert where on a single source', async() => {
        // Prepare store
        const store = new Store([
          DF.quad(DF.namedNode('ex:s'), DF.namedNode('ex:p'), DF.namedNode('ex:o'), DF.defaultGraph()),
          DF.quad(DF.blankNode('s'), DF.namedNode('ex:p'), DF.namedNode('ex:o'), DF.defaultGraph()),
          DF.quad(DF.blankNode('ex:s'), DF.namedNode('ex:p'), DF.namedNode('ex:o'), DF.defaultGraph()),
        ]);

        // Execute query
        const result = <RDF.QueryVoid> await engine.query(`INSERT {
          ?s <ex:a> <ex:thing> .
          ?p <ex:a> <ex:thing> .
          ?o <ex:a> <ex:thing> .
        } WHERE { ?s ?p ?o }`, {
          sources: [ store ],
        });
        await result.execute();

        // Check store contents
        expect(store.size).toBe(8);
        expect(store.countQuads(DF.namedNode('ex:s'), DF.namedNode('ex:p'), DF.namedNode('ex:o'), DF.defaultGraph()))
          .toBe(1);
        expect(store.countQuads(DF.blankNode('s'), DF.namedNode('ex:p'), DF.namedNode('ex:o'), DF.defaultGraph()))
          .toBe(1);
        expect(store.countQuads(DF.blankNode('s'), DF.namedNode('ex:a'), DF.namedNode('ex:thing'), DF.defaultGraph()))
          .toBe(1);
        expect(
          store.countQuads(DF.blankNode('ex:s'), DF.namedNode('ex:p'), DF.namedNode('ex:o'), DF.defaultGraph()),
        )
          .toBe(1);
        expect(
          store.countQuads(DF.blankNode('ex:s'), DF.namedNode('ex:a'), DF.namedNode('ex:thing'), DF.defaultGraph()),
        )
          .toBe(1);
        expect(
          store.countQuads(DF.namedNode('ex:s'), DF.namedNode('ex:a'), DF.namedNode('ex:thing'), DF.defaultGraph()),
        )
          .toBe(1);
        expect(
          store.countQuads(DF.namedNode('ex:p'), DF.namedNode('ex:a'), DF.namedNode('ex:thing'), DF.defaultGraph()),
        )
          .toBe(1);
        expect(
          store.countQuads(DF.namedNode('ex:o'), DF.namedNode('ex:a'), DF.namedNode('ex:thing'), DF.defaultGraph()),
        )
          .toBe(1);
      });

      it('with insert where on two sources', async() => {
        // Prepare store
        const store = new Store([
          DF.quad(DF.blankNode('ex:s'), DF.namedNode('ex:p'), DF.namedNode('ex:o'), DF.defaultGraph()),
        ]);
        const store2 = new Store([
          DF.quad(DF.blankNode('ex:s'), DF.namedNode('ex:p'), DF.namedNode('ex:o'), DF.defaultGraph()),
        ]);

        // Execute query
        const result = <RDF.QueryVoid> await engine.query(`INSERT {
          ?s <ex:a> <ex:thing> .
        } WHERE { ?s ?p ?o }`, {
          sources: [ store, store2 ],
          destination: store,
          [KeysQuerySourceIdentify.sourceIds.name]: new Map(),
        });
        await result.execute();

        // Check store contents
        // There should be 3 quads in this destination store
        // (1) The quad that was originally there
        // (2) The quad _:ex:s <ex:a> <ex:thing>, i.e. the insert applied to the bnode from the destination store
        // (3) The quad _:bc_1_ex:s <ex:a> <ex:thing>, i.e. insert applied the the *different* bnode from store2
        expect(store.size).toBe(3);
        expect(store.countQuads(DF.blankNode('ex:s'), DF.namedNode('ex:p'), DF.namedNode('ex:o'), DF.defaultGraph()))
          .toBe(1);
        expect(
          store.countQuads(
            DF.blankNode('bc_1_ex:s'),
            DF.namedNode('ex:a'),
            DF.namedNode('ex:thing'),
            DF.defaultGraph(),
          ),
        ).toBe(1);
        expect(
          store.countQuads(DF.blankNode('ex:s'), DF.namedNode('ex:a'), DF.namedNode('ex:thing'), DF.defaultGraph()),
        ).toBe(1);
      });

      it('with direct insert and delete', async() => {
        // Prepare store
        const store = new Store();
        store.addQuad(DF.quad(DF.namedNode('ex:s-pre'), DF.namedNode('ex:p-pre'), DF.namedNode('ex:o-pre')));

        // Execute query
        const result = <RDF.QueryVoid> await engine.query(`INSERT DATA {
      <ex:s> <ex:p> <ex:o>.
    };
    DELETE DATA {
      <ex:s-pre> <ex:p-pre> <ex:o-pre>.
    }`, {
          sources: [ 'dummy' ],
          destination: store,
        });
        await result.execute();

        // Check store contents
        expect(store.size).toBe(1);
        expect(store.countQuads(DF.namedNode('ex:s'), DF.namedNode('ex:p'), DF.namedNode('ex:o'), DF.defaultGraph()))
          .toBe(1);
        expect(store
          .countQuads(DF.namedNode('ex:s-pre'), DF.namedNode('ex:p-pre'), DF.namedNode('ex:o-pre'), DF.defaultGraph()))
          .toBe(0);
      });

      it('with variable delete', async() => {
        // Prepare store
        const store = new Store();
        store.addQuads([
          DF.quad(DF.namedNode('ex:s'), DF.namedNode('ex:p1'), DF.namedNode('ex:o1')),
          DF.quad(DF.namedNode('ex:s'), DF.namedNode('ex:p2'), DF.namedNode('ex:o2')),
          DF.quad(DF.namedNode('ex:s'), DF.namedNode('ex:p3'), DF.namedNode('ex:o3')),
          DF.quad(DF.namedNode('ex:s2'), DF.namedNode('ex:p4'), DF.namedNode('ex:o4')),
        ]);
        expect(store.size).toBe(4);

        // Execute query
        const result = <RDF.QueryVoid> await engine.query(`DELETE WHERE {
      <ex:s> ?p ?o.
    }`, {
          sources: [ store ],
          destination: store,
        });
        await result.execute();

        // Check store contents
        expect(store.size).toBe(1);
        expect(store.countQuads(DF.namedNode('ex:s2'), DF.namedNode('ex:p4'), DF.namedNode('ex:o4'), DF.defaultGraph()))
          .toBe(1);
      });

      it('with load', async() => {
        // Prepare store
        const store = new Store();

        // Execute query
        const result = <RDF.QueryVoid> await engine.query(
          `LOAD <https://www.rubensworks.net/> INTO GRAPH <ex:graph>`,
          {
            sources: [ 'dummy' ],
            destination: store,
          },
        );
        await result.execute();

        // Check store contents
        expect(store.size > 0).toBeTruthy();
      });

      it('with clear', async() => {
        // Prepare store
        const store = new Store();
        store.addQuads([
          DF.quad(DF.namedNode('ex:s'), DF.namedNode('ex:p1'), DF.namedNode('ex:o1'), DF.namedNode('ex:g1')),
          DF.quad(DF.namedNode('ex:s'), DF.namedNode('ex:p2'), DF.namedNode('ex:o2'), DF.namedNode('ex:g2')),
          DF.quad(DF.namedNode('ex:s'), DF.namedNode('ex:p3'), DF.namedNode('ex:o3'), DF.namedNode('ex:g3')),
          DF.quad(DF.namedNode('ex:s2'), DF.namedNode('ex:p4'), DF.namedNode('ex:o4'), DF.defaultGraph()),
        ]);
        expect(store.size).toBe(4);

        // Execute query
        const result = <RDF.QueryVoid> await engine.query(`CLEAR NAMED`, {
          sources: [ store ],
          destination: store,
        });
        await result.execute();

        // Check store contents
        expect(store.size).toBe(1);
        expect(store.countQuads(DF.namedNode('ex:s2'), DF.namedNode('ex:p4'), DF.namedNode('ex:o4'), DF.defaultGraph()))
          .toBe(1);
      });

      it('with drop', async() => {
        // Prepare store
        const store = new Store();
        store.addQuads([
          DF.quad(DF.namedNode('ex:s'), DF.namedNode('ex:p1'), DF.namedNode('ex:o1'), DF.namedNode('ex:g1')),
          DF.quad(DF.namedNode('ex:s'), DF.namedNode('ex:p2'), DF.namedNode('ex:o2'), DF.namedNode('ex:g2')),
          DF.quad(DF.namedNode('ex:s'), DF.namedNode('ex:p3'), DF.namedNode('ex:o3'), DF.namedNode('ex:g3')),
          DF.quad(DF.namedNode('ex:s2'), DF.namedNode('ex:p4'), DF.namedNode('ex:o4'), DF.defaultGraph()),
        ]);
        expect(store.size).toBe(4);

        // Execute query
        const result = <RDF.QueryVoid> await engine.query(`DROP DEFAULT`, {
          sources: [ store ],
          destination: store,
        });
        await result.execute();

        // Check store contents
        expect(store.size).toBe(3);
        expect(store.countQuads(DF.namedNode('ex:s4'), DF.namedNode('ex:p4'), DF.namedNode('ex:o4'), DF.defaultGraph()))
          .toBe(0);
      });

      it('with create', async() => {
        // Prepare store
        const store = new Store();
        store.addQuads([
          DF.quad(DF.namedNode('ex:s'), DF.namedNode('ex:p1'), DF.namedNode('ex:o1'), DF.namedNode('ex:g1')),
          DF.quad(DF.namedNode('ex:s2'), DF.namedNode('ex:p4'), DF.namedNode('ex:o4'), DF.defaultGraph()),
        ]);
        expect(store.size).toBe(2);

        // Resolve for non-existing graph
        await expect((<RDF.QueryVoid> await engine.query(`CREATE GRAPH <ex:g2>`, {
          sources: [ store ],
          destination: store,
        })).execute()).resolves.toBeUndefined();

        // Reject for existing graph
        await expect((<RDF.QueryVoid> await engine.query(`CREATE GRAPH <ex:g1>`, {
          sources: [ store ],
          destination: store,
        })).execute()).rejects.toThrow('Unable to create graph ex:g1 as it already exists');

        // Resolve for existing graph in silent mode
        await expect((<RDF.QueryVoid> await engine.query(`CREATE SILENT GRAPH <ex:g1>`, {
          sources: [ store ],
          destination: store,
        })).execute()).resolves.toBeUndefined();
      });

      it('with add', async() => {
        // Prepare store
        const store = new Store();
        store.addQuads([
          DF.quad(DF.namedNode('ex:s'), DF.namedNode('ex:p1'), DF.namedNode('ex:o1'), DF.namedNode('ex:g1')),
          DF.quad(DF.namedNode('ex:s2'), DF.namedNode('ex:p2'), DF.namedNode('ex:o2'), DF.defaultGraph()),
        ]);
        expect(store.size).toBe(2);

        // Execute query
        const result = <RDF.QueryVoid> await engine.query(`ADD DEFAULT TO <ex:g1>`, {
          sources: [ store ],
          destination: store,
        });
        await result.execute();

        // Check store contents
        expect(store.size).toBe(3);
        expect(store
          .countQuads(DF.namedNode('ex:s2'), DF.namedNode('ex:p2'), DF.namedNode('ex:o2'), DF.namedNode('ex:g1')))
          .toBe(1);
      });

      it('with move', async() => {
        // Prepare store
        const store = new Store();
        store.addQuads([
          DF.quad(DF.namedNode('ex:s'), DF.namedNode('ex:p1'), DF.namedNode('ex:o1'), DF.namedNode('ex:g1')),
          DF.quad(DF.namedNode('ex:s2'), DF.namedNode('ex:p2'), DF.namedNode('ex:o2'), DF.defaultGraph()),
        ]);
        expect(store.size).toBe(2);

        // Execute query
        const result = <RDF.QueryVoid> await engine.query(`MOVE DEFAULT TO <ex:g1>`, {
          sources: [ store ],
          destination: store,
        });
        await result.execute();

        // Check store contents
        expect(store.size).toBe(1);
        expect(store
          .countQuads(DF.namedNode('ex:s2'), DF.namedNode('ex:p2'), DF.namedNode('ex:o2'), DF.namedNode('ex:g1')))
          .toBe(1);
      });

      it('with copy', async() => {
        // Prepare store
        const store = new Store();
        store.addQuads([
          DF.quad(DF.namedNode('ex:s'), DF.namedNode('ex:p1'), DF.namedNode('ex:o1'), DF.namedNode('ex:g1')),
          DF.quad(DF.namedNode('ex:s2'), DF.namedNode('ex:p2'), DF.namedNode('ex:o2'), DF.defaultGraph()),
        ]);
        expect(store.size).toBe(2);

        // Execute query
        const result = <RDF.QueryVoid> await engine.query(`COPY DEFAULT TO <ex:g1>`, {
          sources: [ store ],
          destination: store,
        });
        await result.execute();

        // Check store contents
        expect(store.size).toBe(2);
        expect(store
          .countQuads(DF.namedNode('ex:s2'), DF.namedNode('ex:p2'), DF.namedNode('ex:o2'), DF.namedNode('ex:g1')))
          .toBe(1);
      });
    });
  });

  describe('explain', () => {
    describe('a simple SPO on a raw RDF document', () => {
      it('explaining parsing', async() => {
        const result = await engine.explain(`SELECT * WHERE {
      ?s ?p ?o.
    }`, {
          sources: [ 'https://www.rubensworks.net/' ],
        }, 'parsed');
        expect(result).toEqual({
          explain: true,
          type: 'parsed',
          data: {
            input: {
              patterns: [
                factory.createPattern(
                  DF.variable('s'),
                  DF.variable('p'),
                  DF.variable('o'),
                ),
              ],
              type: 'bgp',
            },
            type: 'project',
            variables: [
              DF.variable('o'),
              DF.variable('p'),
              DF.variable('s'),
            ],
          },
        });
      });

      it('explaining logical plan', async() => {
        const result = await engine.explain(`SELECT * WHERE {
      ?s ?p ?o.
    }`, {
          sources: [ 'https://www.rubensworks.net/' ],
        }, 'logical');
        expect(result).toMatchObject({
          explain: true,
          type: 'logical',
          data: {
            input: Object.assign(
              factory.createPattern(
                DF.variable('s'),
                DF.variable('p'),
                DF.variable('o'),
              ),
              {
                metadata: {
                  scopedSource: {
                    source: expect.any(QuerySourceSkolemized),
                  },
                },
              },
            ),
            type: 'project',
            variables: [
              DF.variable('o'),
              DF.variable('p'),
              DF.variable('s'),
            ],
          },
        });
      });

      it('explaining physical plan', async() => {
        const result = await engine.explain(`SELECT * WHERE {
      ?s ?p ?o.
    }`, {
          sources: [ 'https://www.rubensworks.net/' ],
        }, 'physical');
        expect(result).toEqual({
          explain: true,
          type: 'physical',
          data: `project (o,p,s)
  pattern (?s ?p ?o) src:0

sources:
  0: QuerySourceHypermedia(https://www.rubensworks.net/)(SkolemID:0)`,
        });
      });

      it('explaining physical-json plan', async() => {
        const result = await engine.explain(`SELECT * WHERE {
      ?s ?p ?o.
    }`, {
          sources: [ 'https://www.rubensworks.net/' ],
        }, 'physical-json');
        expect(result).toEqual({
          explain: true,
          type: 'physical-json',
          data: {
            logical: 'project',
            variables: [ 'o', 'p', 's' ],
            children: [
              {
                logical: 'pattern',
                pattern: '?s ?p ?o',
                source: 'QuerySourceHypermedia(https://www.rubensworks.net/)(SkolemID:0)',
              },
            ],
          },
        });
      });
    });
  });
});
