import { ActorInitQuery } from '@comunica/actor-init-query';
import { Bus } from '@comunica/core';
import arrayifyStream from 'arrayify-stream';
import { DataFactory } from 'rdf-data-factory';
import { Factory } from 'sparqlalgebrajs';
import { ActorRdfMetadataExtractVoid } from '../lib/ActorRdfMetadataExtractVoid';
import '@comunica/utils-jest';

const streamifyArray = require('streamify-array');

jest.mock('@comunica/actor-init-query');
jest.mock('@comunica/bus-rdf-metadata-extract');

const DF = new DataFactory();
const AF = new Factory(DF);

describe('ActorRdfMetadataExtractVoid', () => {
  let bus: any;
  let actor: ActorRdfMetadataExtractVoid;
  let actorInitQuery: ActorInitQuery;

  beforeEach(() => {
    jest.resetAllMocks();
    bus = new Bus({ name: 'bus' });
    actorInitQuery = new ActorInitQuery(<any> {});
    actor = new ActorRdfMetadataExtractVoid({
      bus,
      name: 'actor',
      actorInitQuery,
      bindingsCacheSize: 10,
      inferUriRegexPattern: true,
    });
    (<any>actor).queryEngine = {
      queryBindings: () => {
        throw new Error('queryBindings called without mocking');
      },
    };
  });

  describe('test', () => {
    it('should test', async() => {
      await expect(actor.test(<any> {})).resolves.toBeTruthy();
    });
  });

  describe('run', () => {
    it('should return collected datasets', async() => {
      jest.spyOn(actor, 'collectFromMetadata').mockResolvedValue(<any>'store');
      jest.spyOn(actor, 'getDatasets').mockResolvedValue([ <any>'dataset' ]);
      await expect(actor.run(<any>{})).resolves.toEqual({ metadata: { voidDatasets: [ 'dataset' ]}});
    });

    it('should return empty metadata without datasets', async() => {
      jest.spyOn(actor, 'collectFromMetadata').mockResolvedValue(<any>'store');
      jest.spyOn(actor, 'getDatasets').mockResolvedValue([]);
      await expect(actor.run(<any>{})).resolves.toEqual({ metadata: {}});
    });
  });

  describe('collectFromMetadata', () => {
    it('should collect only relevant quads', async() => {
      const stream = streamifyArray([
        DF.quad(DF.blankNode(), DF.namedNode(`${ActorRdfMetadataExtractVoid.VOID}triples`), DF.literal('0')),
        DF.quad(DF.blankNode(), DF.namedNode(`${ActorRdfMetadataExtractVoid.SPARQLSD}feature`), DF.literal('f')),
        DF.quad(DF.blankNode(), DF.namedNode('ex:p'), DF.literal('o')),
      ]);
      const store = await actor.collectFromMetadata(stream);
      const output = await arrayifyStream(store.match());
      expect(output).toHaveLength(2);
    });
  });

  describe('getDatasets', () => {
    it('should execute correctly', async() => {
      const sourceUrl = 'ex:void';
      const b1 = {
        data: { identifier: DF.namedNode('ex:d1'), uriRegexPattern: DF.literal('^ex:') },
        get: (key: string) => (<any>b1.data)[key],
        has: (key: string) => key in b1.data,
      };
      const b2 = {
        data: { identifier: DF.namedNode('ex:d2'), uriSpace: DF.literal('ex:') },
        get: (key: string) => (<any>b2.data)[key],
        has: (key: string) => key in b2.data,
      };
      const b3 = {
        data: { identifier: DF.namedNode('ex:d3') },
        get: (key: string) => (<any>b3.data)[key],
        has: (key: string) => key in b3.data,
      };
      const b4 = {
        data: { identifier: DF.blankNode() },
        get: (key: string) => (<any>b4.data)[key],
        has: (key: string) => key in b4.data,
      };
      jest.spyOn((<any>actor).queryEngine, 'queryBindings').mockResolvedValue(streamifyArray([ b1, b2, b3, b4 ]));
      jest.spyOn(actor, 'getVocabularies').mockResolvedValue(undefined);
      jest.spyOn(actor, 'estimatePatternCardinality').mockResolvedValue(<any>'cardinality');
      const datasets = await actor.getDatasets(<any>{}, sourceUrl);
      expect(datasets).toEqual([
        {
          estimateCardinality: expect.any(Function),
          identifier: b1.data.identifier,
          source: sourceUrl,
          store: expect.any(Object),
          uriRegexPattern: /^ex:/u,
          vocabularies: undefined,
        },
        {
          estimateCardinality: expect.any(Function),
          identifier: b2.data.identifier,
          source: sourceUrl,
          store: expect.any(Object),
          uriRegexPattern: /^ex:/u,
          vocabularies: undefined,
        },
        {
          estimateCardinality: expect.any(Function),
          identifier: b3.data.identifier,
          source: sourceUrl,
          store: expect.any(Object),
          uriRegexPattern: /^ex:\/\//u,
          vocabularies: undefined,
        },
        {
          estimateCardinality: expect.any(Function),
          identifier: b4.data.identifier,
          source: sourceUrl,
          store: expect.any(Object),
          uriRegexPattern: /^ex:\/\//u,
          vocabularies: undefined,
        },
      ]);
      for (const ds of datasets) {
        await expect(ds.estimateCardinality(<any>{})).resolves.toBe('cardinality');
      }
    });
  });

  describe('getVocabularies', () => {
    it('should return vocabularies when present', async() => {
      jest.spyOn((<any>actor).queryEngine, 'queryBindings').mockResolvedValue(streamifyArray([
        { get: () => ({ value: 'v' }) },
      ]));
      await expect(actor.getVocabularies(<any>{}, <any>{})).resolves.toEqual([ 'v' ]);
    });

    it('should return undefined when no vocabularies are present', async() => {
      jest.spyOn((<any>actor).queryEngine, 'queryBindings').mockResolvedValue(streamifyArray([]));
      await expect(actor.getVocabularies(<any>{}, <any>{})).resolves.toBeUndefined();
    });
  });

  describe('estimatePatternCardinality', () => {
    it('should return 0 when the source cannot answer the pattern', async() => {
      jest.spyOn(actor, 'matchUriRegexPattern').mockReturnValue(false);
      jest.spyOn(actor, 'matchVocabularies').mockReturnValue(false);
      jest.spyOn(actor, 'estimatePatternCardinalityRaw').mockResolvedValue(1);
      expect(actor.matchUriRegexPattern).not.toHaveBeenCalled();
      expect(actor.matchVocabularies).not.toHaveBeenCalled();
      expect(actor.estimatePatternCardinalityRaw).not.toHaveBeenCalled();
      await expect(actor.estimatePatternCardinality(<any>{}, <any>{})).resolves.toEqual({
        type: 'exact',
        value: 0,
      });
      expect(actor.matchVocabularies).toHaveBeenCalledTimes(1);
      expect(actor.matchUriRegexPattern).not.toHaveBeenCalled();
      expect(actor.estimatePatternCardinalityRaw).not.toHaveBeenCalled();
    });

    it('should return the estimated cardinality', async() => {
      jest.spyOn(actor, 'matchUriRegexPattern').mockReturnValue(true);
      jest.spyOn(actor, 'matchVocabularies').mockReturnValue(true);
      jest.spyOn(actor, 'estimatePatternCardinalityRaw').mockResolvedValue(1);
      expect(actor.matchUriRegexPattern).not.toHaveBeenCalled();
      expect(actor.matchVocabularies).not.toHaveBeenCalled();
      expect(actor.estimatePatternCardinalityRaw).not.toHaveBeenCalled();
      await expect(actor.estimatePatternCardinality(<any>{}, <any>{})).resolves.toEqual({
        type: 'estimate',
        value: 1,
      });
      expect(actor.matchUriRegexPattern).toHaveBeenCalledTimes(1);
      expect(actor.matchVocabularies).toHaveBeenCalledTimes(1);
      expect(actor.estimatePatternCardinalityRaw).toHaveBeenCalledTimes(1);
    });
  });

  describe('matchUriRegexPattern', () => {
    const pattern = AF.createPattern(DF.namedNode('ex:s'), DF.namedNode('ex:p'), DF.namedNode('ex:o'));

    it('should return true without regex provided', () => {
      expect(actor.matchUriRegexPattern(pattern, undefined)).toBeTruthy();
    });

    it('should return true with matching regex provided', () => {
      expect(actor.matchUriRegexPattern(pattern, /^ex:/u)).toBeTruthy();
    });

    it('should return false with non-matching regex provided', () => {
      expect(actor.matchUriRegexPattern(pattern, /^ex2:/u)).toBeFalsy();
    });
  });

  describe('matchVocabularies', () => {
    const pattern = AF.createPattern(DF.variable('s'), DF.namedNode('ex:p'), DF.variable('o'));

    it('should return true without vocabularies provided', () => {
      expect(actor.matchVocabularies(pattern, undefined)).toBeTruthy();
    });

    it('should return true when matching vocabularies are provided', () => {
      expect(actor.matchVocabularies(pattern, [ 'ex:' ])).toBeTruthy();
    });

    it('should return false with non-matching vocabularies provided', () => {
      expect(actor.matchVocabularies(pattern, [ 'ex2:' ])).toBeFalsy();
    });
  });

  describe('estimatePatternCardinalityRaw', () => {
    const rdfType = DF.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type');

    describe.each([
      /* eslint-disable max-len */
      [ '?s rdf:type <o>', AF.createPattern(DF.variable('s'), rdfType, DF.namedNode('ex:o')), 3, 3, 0 ],
      [ '?s ?p ?o', AF.createPattern(DF.variable('s'), DF.variable('p'), DF.variable('o')), 9, 0, 9 ],
      [ '<s> ?p ?o', AF.createPattern(DF.namedNode('ex:s'), DF.variable('p'), DF.variable('o')), 3, 0, Number.POSITIVE_INFINITY ],
      [ '?s <p> ?o', AF.createPattern(DF.variable('s'), DF.namedNode('ex:p'), DF.variable('o')), 9, 0, 9 ],
      [ '?s ?p <o>', AF.createPattern(DF.variable('s'), DF.variable('p'), DF.namedNode('ex:o')), 3, 0, Number.POSITIVE_INFINITY ],
      [ '<s> <p> ?o', AF.createPattern(DF.namedNode('ex:s'), DF.namedNode('ex:p'), DF.variable('o')), 3, 0, Number.POSITIVE_INFINITY ],
      [ '<s> ?p <o>', AF.createPattern(DF.namedNode('ex:s'), DF.variable('p'), DF.namedNode('ex:o')), 1, 0, Number.POSITIVE_INFINITY ],
      [ '?s <p> <o>', AF.createPattern(DF.variable('s'), DF.namedNode('ex:p'), DF.namedNode('ex:o')), 3, 0, Number.POSITIVE_INFINITY ],
      [ '<s> <p> <o>', AF.createPattern(DF.namedNode('ex:s'), DF.namedNode('ex:p'), DF.namedNode('ex:o')), 1, 0, Number.POSITIVE_INFINITY ],
    ])('should execute successfully for %s', (type, pattern, value, valueWith0Triples, valueWith0Divisor) => {
      /* eslint-enable max-len */
      it('with triple counts provided', async() => {
        jest.spyOn(actor, 'getTriples').mockResolvedValue(9);
        jest.spyOn(actor, 'getDistinctSubjects').mockResolvedValue(3);
        jest.spyOn(actor, 'getDistinctObjects').mockResolvedValue(3);
        jest.spyOn(actor, 'getPredicateTriples').mockResolvedValue(9);
        jest.spyOn(actor, 'getPredicateObjects').mockResolvedValue(3);
        jest.spyOn(actor, 'getPredicateSubjects').mockResolvedValue(3);
        jest.spyOn(actor, 'getClassPartitionEntities').mockResolvedValue(3);
        await expect(actor.estimatePatternCardinalityRaw(<any>{}, pattern)).resolves.toBe(value);
      });

      it('with no triple counts provided', async() => {
        jest.spyOn(actor, 'getTriples').mockResolvedValue(0);
        jest.spyOn(actor, 'getDistinctSubjects').mockResolvedValue(3);
        jest.spyOn(actor, 'getDistinctObjects').mockResolvedValue(3);
        jest.spyOn(actor, 'getPredicateTriples').mockResolvedValue(0);
        jest.spyOn(actor, 'getPredicateObjects').mockResolvedValue(3);
        jest.spyOn(actor, 'getPredicateSubjects').mockResolvedValue(3);
        jest.spyOn(actor, 'getClassPartitionEntities').mockResolvedValue(3);
        await expect(actor.estimatePatternCardinalityRaw(<any>{}, pattern)).resolves.toBe(valueWith0Triples);
      });

      it('with formulae divisors approaching zero', async() => {
        jest.spyOn(actor, 'getTriples').mockResolvedValue(9);
        jest.spyOn(actor, 'getDistinctSubjects').mockResolvedValue(0);
        jest.spyOn(actor, 'getDistinctObjects').mockResolvedValue(0);
        jest.spyOn(actor, 'getPredicateTriples').mockResolvedValue(9);
        jest.spyOn(actor, 'getPredicateObjects').mockResolvedValue(0);
        jest.spyOn(actor, 'getPredicateSubjects').mockResolvedValue(0);
        jest.spyOn(actor, 'getClassPartitionEntities').mockResolvedValue(0);
        await expect(actor.estimatePatternCardinalityRaw(<any>{}, pattern)).resolves.toBe(valueWith0Divisor);
      });
    });
  });

  describe('getTriples', () => {
    it('should execute successfully', async() => {
      jest.spyOn(actor, 'getBindings').mockResolvedValue([]);
      expect(actor.getBindings).not.toHaveBeenCalled();
      await expect(actor.getTriples(<any>{ identifier: DF.blankNode() })).resolves.toBe(0);
      expect(actor.getBindings).toHaveBeenCalledTimes(1);
    });
  });

  describe('getDistinctSubjects', () => {
    it('should execute successfully', async() => {
      jest.spyOn(actor, 'getBindings').mockResolvedValue([]);
      expect(actor.getBindings).not.toHaveBeenCalled();
      await expect(actor.getDistinctSubjects(<any>{ identifier: DF.blankNode() })).resolves.toBe(0);
      expect(actor.getBindings).toHaveBeenCalledTimes(1);
    });
  });

  describe('getDistinctObjects', () => {
    it('should execute successfully', async() => {
      jest.spyOn(actor, 'getBindings').mockResolvedValue([]);
      expect(actor.getBindings).not.toHaveBeenCalled();
      await expect(actor.getDistinctObjects(<any>{ identifier: DF.blankNode() })).resolves.toBe(0);
      expect(actor.getBindings).toHaveBeenCalledTimes(1);
    });
  });

  describe('getPredicateTriples', () => {
    it('should execute successfully', async() => {
      jest.spyOn(actor, 'getBindings').mockResolvedValue([]);
      expect(actor.getBindings).not.toHaveBeenCalled();
      await expect(actor.getPredicateTriples(
        <any>{ identifier: DF.blankNode() },
        DF.namedNode('ex:p'),
      )).resolves.toBe(0);
      expect(actor.getBindings).toHaveBeenCalledTimes(1);
    });
  });

  describe('getPredicateSubjects', () => {
    it('should execute successfully', async() => {
      jest.spyOn(actor, 'getBindings').mockResolvedValue([]);
      expect(actor.getBindings).not.toHaveBeenCalled();
      await expect(actor.getPredicateSubjects(
        <any>{ identifier: DF.blankNode() },
        DF.namedNode('ex:p'),
      )).resolves.toBe(0);
      expect(actor.getBindings).toHaveBeenCalledTimes(1);
    });
  });

  describe('getPredicateObjects', () => {
    it('should execute successfully', async() => {
      jest.spyOn(actor, 'getBindings').mockResolvedValue([]);
      expect(actor.getBindings).not.toHaveBeenCalled();
      await expect(actor.getPredicateObjects(
        <any>{ identifier: DF.blankNode() },
        DF.namedNode('ex:p'),
      )).resolves.toBe(0);
      expect(actor.getBindings).toHaveBeenCalledTimes(1);
    });
  });

  describe('getClassPartitionEntities', () => {
    it('should execute successfully', async() => {
      jest.spyOn(actor, 'getBindings').mockResolvedValue([]);
      expect(actor.getBindings).not.toHaveBeenCalled();
      await expect(actor.getClassPartitionEntities(
        <any>{ identifier: DF.blankNode() },
        DF.namedNode('ex:o'),
      )).resolves.toBe(0);
      expect(actor.getBindings).toHaveBeenCalledTimes(1);
    });
  });

  describe('getBindings', () => {
    it('should execute the given query and cache the result', async() => {
      jest.spyOn((<any>actor).queryEngine, 'queryBindings').mockResolvedValue({ toArray: () => []});
      expect((<any>actor).queryEngine.queryBindings).not.toHaveBeenCalled();
      await expect(actor.getBindings(<any>{}, 'q')).resolves.toEqual([]);
      expect((<any>actor).queryEngine.queryBindings).toHaveBeenCalledTimes(1);
      await expect(actor.getBindings(<any>{}, 'q')).resolves.toEqual([]);
      expect((<any>actor).queryEngine.queryBindings).toHaveBeenCalledTimes(1);
    });
  });
});
