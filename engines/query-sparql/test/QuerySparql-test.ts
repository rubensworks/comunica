/** @jest-environment setup-polly-jest/jest-environment-node */

// Needed to undo automock from actor-http-native, cleaner workarounds do not appear to be working.
jest.unmock('follow-redirects');

import { KeysHttpInterceptWayback, KeysRdfResolveQuadPattern } from '@comunica/context-entries';
import { BlankNodeScoped } from '@comunica/data-factory';
import type { QueryBindings, QueryStringContext } from '@comunica/types';
import type * as RDF from '@rdfjs/types';
import 'jest-rdf';
import arrayifyStream from 'arrayify-stream';
import { Store } from 'n3';
import { DataFactory } from 'rdf-data-factory';
import { Factory } from 'sparqlalgebrajs';
import { QueryEngine } from '../lib/QueryEngine';
import { mockHttp } from './util';

const DF = new DataFactory();
const factory = new Factory();

describe('System test: QuerySparql', () => {
  const pollyContext = mockHttp();

  let engine: QueryEngine;

  beforeEach(() => {
    engine = new QueryEngine();
    pollyContext.polly.server.any().on('beforePersist', (req, recording) => {
      recording.request.headers = recording.request.headers.filter(({ name }: any) => name !== 'user-agent');
    });
  });

  afterEach(async() => {
    await pollyContext.polly.flush();
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
        expect((await arrayifyStream(await result.execute()))).toEqual([]);
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
        expect((await arrayifyStream(await (<QueryBindings> await engine.query(query, context)).execute())))
          .toEqual([]);
        expect((await arrayifyStream(await (<QueryBindings> await engine.query(query, context)).execute())))
          .toEqual([]);
        expect((await arrayifyStream(await (<QueryBindings> await engine.query(query, context)).execute())))
          .toEqual([]);
        expect((await arrayifyStream(await (<QueryBindings> await engine.query(query, context)).execute())))
          .toEqual([]);
        expect((await arrayifyStream(await (<QueryBindings> await engine.query(query, context)).execute())))
          .toEqual([]);
      });

      describe('handle blank nodes with DESCRIBE queries', () => {
        let store: Store;
        let quads: RDF.Quad[];
        const query = `DESCRIBE ?o  {
          ?s ?p ?o .
      }`;

        beforeEach(() => {
          engine = new QueryEngine();
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

          expect(result.length).toBe(expectedResult.length);
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

          expect(result.length).toBe(expectedResult.length);
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

          expect(result.length).toBe(expectedResult.length);
          expect(result).toMatchObject(expectedResult);
        });

        it('return consistent blank nodes with a data source that should return one blank node and one named node',
          async() => {
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

            expect(result.length).toBe(expectedResult.length);
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
            'http://example.org/functions#allowAll': async(args: RDF.Term[]) => DF.literal('true', booleanType),
          };
          baseFunctionCreator = (functionName: RDF.NamedNode) =>
            async(args: RDF.Term[]) => DF.literal('true', booleanType);
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
          await expect(engine.query(baseQuery('nonExist'), context)).rejects.toThrow('Unknown named operator');
        });

        it('rejects when creator returns null', async() => {
          const context = <any> { sources: [ store ]};
          context.extensionFunctionCreator = () => null;
          await expect(engine.query(baseQuery('nonExist'), context)).rejects.toThrow('Unknown named operator');
        });

        it('with results and pointless custom filter given by creator', async() => {
          const context = <any> { sources: [ store ]};
          context.extensionFunctionCreator = baseFunctionCreator;
          const result = <QueryBindings> await engine.query(baseQuery(funcAllow), context);
          expect((await arrayifyStream(await result.execute())).length).toEqual(store.size);
        });

        it('with results and pointless custom filter given by record', async() => {
          const context = <any> { sources: [ store ]};
          context.extensionFunctions = baseFunctions;
          const result = <QueryBindings> await engine.query(baseQuery(funcAllow), context);
          expect((await arrayifyStream(await result.execute())).length).toEqual(4);
        });

        it('with results but all filtered away', async() => {
          const context = <any> { sources: [ store ]};
          context.extensionFunctionCreator = () => () =>
            DF.literal('false', booleanType);
          const result = <QueryBindings> await engine.query(baseQuery('rejectAll'), context);
          expect(await arrayifyStream(await result.execute())).toEqual([]);
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
            async 'http://example.org/functions#to-upper-case'(args: RDF.Term[]) {
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
    });

    describe('simple SPS', () => {
      it('Raw Source', async() => {
        const result = <QueryBindings> await engine.query(`SELECT * WHERE {
      ?s ?p ?s.
    }`, { sources: [ 'https://www.rubensworks.net/' ]});
        expect(((await arrayifyStream(await result.execute())).length)).toEqual(1);
      });

      it('RDFJS Source', async() => {
        const store = new Store([
          DF.quad(DF.namedNode('s'), DF.namedNode('p'), DF.namedNode('s')),
          DF.quad(DF.namedNode('l'), DF.namedNode('m'), DF.namedNode('n')),
        ]);
        const result = <QueryBindings> await engine.query(`SELECT * WHERE {
      ?s ?p ?s.
    }`, { sources: [ store ]});
        expect((await arrayifyStream(await result.execute())).length).toEqual(1);
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
        expect((await arrayifyStream(await result.execute()))).toEqual([]);
      });

      it('for the single source entry', async() => {
        const result = <QueryBindings> await engine.query(`SELECT ?name WHERE {
  <https://www.rubensworks.net/#me> <http://xmlns.com/foaf/0.1/knows> ?v0.
  ?v0 <http://xmlns.com/foaf/0.1/name> ?name.
    }`, { sources: [ 'https://www.rubensworks.net/' ]});
        expect((await arrayifyStream(await result.execute())).length).toBeGreaterThan(20);
      });
    });

    describe('simple SPO on a TPF entrypoint', () => {
      it('with results', async() => {
        const result = <QueryBindings> await engine.query(`SELECT * WHERE {
      ?s ?p ?o.
    } LIMIT 300`, { sources: [ 'https://fragments.dbpedia.org/2016-04/en' ]});
        expect((await arrayifyStream(await result.execute())).length).toEqual(300);
        await new Promise(resolve => setTimeout(resolve, 10)); // To avoid unhandled errors
      });

      it('with filtered results', async() => {
        const result = <QueryBindings> await engine.query(`SELECT * WHERE {
      ?s a ?o.
    } LIMIT 300`, { sources: [ 'https://fragments.dbpedia.org/2016-04/en' ]});
        expect((await arrayifyStream(await result.execute())).length).toEqual(300);
        await new Promise(resolve => setTimeout(resolve, 10)); // To avoid unhandled errors
      });
    });

    describe('two-pattern query on a TPF entrypoint', () => {
      it('with results', async() => {
        const result = <QueryBindings> await engine.query(`SELECT * WHERE {
      ?city a <http://dbpedia.org/ontology/Airport>;
            <http://dbpedia.org/property/cityServed> <http://dbpedia.org/resource/Italy>.
    }`, { sources: [ 'https://fragments.dbpedia.org/2016-04/en' ]});
        expect((await arrayifyStream(await result.execute())).length).toEqual(19);
      });

      it('without results', async() => {
        const result = <QueryBindings> await engine.query(`SELECT * WHERE {
      ?city a <http://dbpedia.org/ontology/Airport>;
            <http://dbpedia.org/property/cityServed> <http://dbpedia.org/resource/UNKNOWN>.
    }`, { sources: [ 'https://fragments.dbpedia.org/2016-04/en' ]});
        expect((await arrayifyStream(await result.execute()))).toEqual([]);
      });
    });
  });

  // TODO: Re-enable this once https://github.com/RubenVerborgh/AsyncIterator/pull/45 is closed
  // currently including this causes the test suite to block
  // describe('rejecting on broken links', () => {
  //   it('rejects without link recovery', async() => {
  //     const result = <Promise<QueryBindings>> engine.query(`SELECT * WHERE {
  //   <http://xmlns.com/foaf/0.1/> a <http://www.w3.org/2002/07/owl#Ontology>.
  // }`, { sources: [ 'http://xmlns.com/foaf/spec/20140114.rdf' ]});
  //     await expect(result.then(r => r.execute())).rejects.toThrowError();
  //   });
  // });

  describe('foaf ontology broken link [using full key]', () => {
    it('returns results with link recovery on [using full key]', async() => {
      const result = <QueryBindings> await engine.query(`SELECT * WHERE {
    <http://xmlns.com/foaf/0.1/> a <http://www.w3.org/2002/07/owl#Ontology>.
  }`, {
        sources: [ 'http://xmlns.com/foaf/spec/20140114.rdf' ],
        [KeysHttpInterceptWayback.recoverBrokenLinks.name]: true,
      });
      expect((await arrayifyStream(await result.execute())).length).toEqual(1);
    });
  });

  describe('foaf ontology broken link [using shortcut key]', () => {
    it('returns results with link recovery on [using shortcut key]', async() => {
      const result = <QueryBindings> await engine.query(`SELECT * WHERE {
    <http://xmlns.com/foaf/0.1/> a <http://www.w3.org/2002/07/owl#Ontology>.
  }`, { sources: [ 'http://xmlns.com/foaf/spec/20140114.rdf' ], recoverBrokenLinks: true });
      expect((await arrayifyStream(await result.execute())).length).toEqual(1);
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
        expect(store.size).toEqual(1);
        expect(store.countQuads(DF.namedNode('ex:s'), DF.namedNode('ex:p'), DF.namedNode('ex:o'), DF.defaultGraph()))
          .toEqual(1);
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
        expect(store.size).toEqual(1);
        expect(store.countQuads(DF.namedNode('ex:s'), DF.namedNode('ex:p'), DF.namedNode('ex:o'), DF.defaultGraph()))
          .toEqual(1);
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
        expect(store.size).toEqual(8);
        expect(store.countQuads(DF.namedNode('ex:s'), DF.namedNode('ex:p'), DF.namedNode('ex:o'), DF.defaultGraph()))
          .toEqual(1);
        expect(store.countQuads(DF.blankNode('s'), DF.namedNode('ex:p'), DF.namedNode('ex:o'), DF.defaultGraph()))
          .toEqual(1);
        expect(store.countQuads(DF.blankNode('s'), DF.namedNode('ex:a'), DF.namedNode('ex:thing'), DF.defaultGraph()))
          .toEqual(1);
        expect(
          store.countQuads(DF.blankNode('ex:s'), DF.namedNode('ex:p'), DF.namedNode('ex:o'), DF.defaultGraph()),
        )
          .toEqual(1);
        expect(
          store.countQuads(DF.blankNode('ex:s'), DF.namedNode('ex:a'), DF.namedNode('ex:thing'), DF.defaultGraph()),
        )
          .toEqual(1);
        expect(
          store.countQuads(DF.namedNode('ex:s'), DF.namedNode('ex:a'), DF.namedNode('ex:thing'), DF.defaultGraph()),
        )
          .toEqual(1);
        expect(
          store.countQuads(DF.namedNode('ex:p'), DF.namedNode('ex:a'), DF.namedNode('ex:thing'), DF.defaultGraph()),
        )
          .toEqual(1);
        expect(
          store.countQuads(DF.namedNode('ex:o'), DF.namedNode('ex:a'), DF.namedNode('ex:thing'), DF.defaultGraph()),
        )
          .toEqual(1);
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
          [KeysRdfResolveQuadPattern.sourceIds.name]: new Map(),
        });
        await result.execute();

        // Check store contents
        // There should be 3 quads in this destination store
        // (1) The quad that was originally there
        // (2) The quad _:ex:s <ex:a> <ex:thing>, i.e. the insert applied to the bnode from the destination store
        // (3) The quad _:bc_1_ex:s <ex:a> <ex:thing>, i.e. insert applied the the *different* bnode from store2
        expect(store.size).toEqual(3);
        expect(store.countQuads(DF.blankNode('ex:s'), DF.namedNode('ex:p'), DF.namedNode('ex:o'), DF.defaultGraph()))
          .toEqual(1);
        expect(
          store.countQuads(
            DF.blankNode('bc_1_ex:s'),
            DF.namedNode('ex:a'),
            DF.namedNode('ex:thing'),
            DF.defaultGraph(),
          ),
        ).toEqual(1);
        expect(
          store.countQuads(DF.blankNode('ex:s'), DF.namedNode('ex:a'), DF.namedNode('ex:thing'), DF.defaultGraph()),
        );
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
        expect(store.size).toEqual(1);
        expect(store.countQuads(DF.namedNode('ex:s'), DF.namedNode('ex:p'), DF.namedNode('ex:o'), DF.defaultGraph()))
          .toEqual(1);
        expect(store
          .countQuads(DF.namedNode('ex:s-pre'), DF.namedNode('ex:p-pre'), DF.namedNode('ex:o-pre'), DF.defaultGraph()))
          .toEqual(0);
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
        expect(store.size).toEqual(4);

        // Execute query
        const result = <RDF.QueryVoid> await engine.query(`DELETE WHERE {
      <ex:s> ?p ?o.
    }`, {
          sources: [ store ],
          destination: store,
        });
        await result.execute();

        // Check store contents
        expect(store.size).toEqual(1);
        expect(store.countQuads(DF.namedNode('ex:s2'), DF.namedNode('ex:p4'), DF.namedNode('ex:o4'), DF.defaultGraph()))
          .toEqual(1);
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
        expect(store.size).toEqual(4);

        // Execute query
        const result = <RDF.QueryVoid> await engine.query(`CLEAR NAMED`, {
          sources: [ store ],
          destination: store,
        });
        await result.execute();

        // Check store contents
        expect(store.size).toEqual(1);
        expect(store.countQuads(DF.namedNode('ex:s2'), DF.namedNode('ex:p4'), DF.namedNode('ex:o4'), DF.defaultGraph()))
          .toEqual(1);
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
        expect(store.size).toEqual(4);

        // Execute query
        const result = <RDF.QueryVoid> await engine.query(`DROP DEFAULT`, {
          sources: [ store ],
          destination: store,
        });
        await result.execute();

        // Check store contents
        expect(store.size).toEqual(3);
        expect(store.countQuads(DF.namedNode('ex:s4'), DF.namedNode('ex:p4'), DF.namedNode('ex:o4'), DF.defaultGraph()))
          .toEqual(0);
      });

      it('with create', async() => {
        // Prepare store
        const store = new Store();
        store.addQuads([
          DF.quad(DF.namedNode('ex:s'), DF.namedNode('ex:p1'), DF.namedNode('ex:o1'), DF.namedNode('ex:g1')),
          DF.quad(DF.namedNode('ex:s2'), DF.namedNode('ex:p4'), DF.namedNode('ex:o4'), DF.defaultGraph()),
        ]);
        expect(store.size).toEqual(2);

        // Resolve for non-existing graph
        await expect((<RDF.QueryVoid> await engine.query(`CREATE GRAPH <ex:g2>`, {
          sources: [ store ],
          destination: store,
        })).execute()).resolves.toBeUndefined();

        // Reject for existing graph
        await expect((<RDF.QueryVoid> await engine.query(`CREATE GRAPH <ex:g1>`, {
          sources: [ store ],
          destination: store,
        })).execute()).rejects.toThrowError('Unable to create graph ex:g1 as it already exists');

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
        expect(store.size).toEqual(2);

        // Execute query
        const result = <RDF.QueryVoid> await engine.query(`ADD DEFAULT TO <ex:g1>`, {
          sources: [ store ],
          destination: store,
        });
        await result.execute();

        // Check store contents
        expect(store.size).toEqual(3);
        expect(store
          .countQuads(DF.namedNode('ex:s2'), DF.namedNode('ex:p2'), DF.namedNode('ex:o2'), DF.namedNode('ex:g1')))
          .toEqual(1);
      });

      it('with move', async() => {
        // Prepare store
        const store = new Store();
        store.addQuads([
          DF.quad(DF.namedNode('ex:s'), DF.namedNode('ex:p1'), DF.namedNode('ex:o1'), DF.namedNode('ex:g1')),
          DF.quad(DF.namedNode('ex:s2'), DF.namedNode('ex:p2'), DF.namedNode('ex:o2'), DF.defaultGraph()),
        ]);
        expect(store.size).toEqual(2);

        // Execute query
        const result = <RDF.QueryVoid> await engine.query(`MOVE DEFAULT TO <ex:g1>`, {
          sources: [ store ],
          destination: store,
        });
        await result.execute();

        // Check store contents
        expect(store.size).toEqual(1);
        expect(store
          .countQuads(DF.namedNode('ex:s2'), DF.namedNode('ex:p2'), DF.namedNode('ex:o2'), DF.namedNode('ex:g1')))
          .toEqual(1);
      });

      it('with copy', async() => {
        // Prepare store
        const store = new Store();
        store.addQuads([
          DF.quad(DF.namedNode('ex:s'), DF.namedNode('ex:p1'), DF.namedNode('ex:o1'), DF.namedNode('ex:g1')),
          DF.quad(DF.namedNode('ex:s2'), DF.namedNode('ex:p2'), DF.namedNode('ex:o2'), DF.defaultGraph()),
        ]);
        expect(store.size).toEqual(2);

        // Execute query
        const result = <RDF.QueryVoid> await engine.query(`COPY DEFAULT TO <ex:g1>`, {
          sources: [ store ],
          destination: store,
        });
        await result.execute();

        // Check store contents
        expect(store.size).toEqual(2);
        expect(store
          .countQuads(DF.namedNode('ex:s2'), DF.namedNode('ex:p2'), DF.namedNode('ex:o2'), DF.namedNode('ex:g1')))
          .toEqual(1);
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
        expect(result).toEqual({
          explain: true,
          type: 'logical',
          data: {
            input: {
              input: [
                factory.createPattern(
                  DF.variable('s'),
                  DF.variable('p'),
                  DF.variable('o'),
                ),
              ],
              type: 'join',
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

      it('explaining physical plan', async() => {
        const result = await engine.explain(`SELECT * WHERE {
      ?s ?p ?o.
    }`, {
          sources: [ 'https://www.rubensworks.net/' ],
        }, 'physical');
        expect(result).toEqual({
          explain: true,
          type: 'physical',
          data: {
            logical: 'project',
            variables: [ 'o', 'p', 's' ],
            children: [
              {
                logical: 'join',
                children: [
                  {
                    logical: 'pattern',
                    pattern: '?s ?p ?o',
                  },
                ],
              },
            ],
          },
        });
      });
    });
  });
});
