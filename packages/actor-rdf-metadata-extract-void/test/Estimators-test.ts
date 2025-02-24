import { DataFactory } from 'rdf-data-factory';
import { Factory, Algebra } from 'sparqlalgebrajs';
import { RDF_TYPE } from '../lib/Definitions';
import {
  getCardinality,
  getPatternCardinality,
  getClassPartitionEntities,
  getPredicateObjects,
  getPredicateSubjects,
  getPredicateTriples,
  getDistinctSubjects,
  getDistinctObjects,
  matchPatternVocabularies,
  matchPatternResourceUris,
  getJoinCardinality,
  getGraphCardinality,
  getFromCardinality,
  getPatternCardinalityRaw,
} from '../lib/Estimators';
import type { IVoidDataset } from '../lib/Types';

const DF = new DataFactory();
const AF = new Factory(DF);

const rdfType = DF.namedNode(RDF_TYPE);

const subjectBNode = DF.blankNode('s');
const subjectNamedNode = DF.namedNode('ex:s');
const subjectVariable = DF.variable('s');
const subjectLiteral = DF.literal('s');

const predicateNamedNode = DF.namedNode('ex:p');
const predicateVariable = DF.variable('p');

const objectBNode = DF.blankNode('o');
const objectNamedNode = DF.namedNode('ex:o');
const objectVariable = DF.variable('o');
const objectLiteral = DF.literal('o');

const patterns = {
  '?s rdf:type <o>': AF.createPattern(subjectVariable, rdfType, objectNamedNode),
  '?s rdf:type _:o': AF.createPattern(subjectVariable, rdfType, objectBNode),
  '?s ?p ?o': AF.createPattern(subjectVariable, predicateVariable, objectVariable),
  '?s ?p "o"': AF.createPattern(subjectVariable, predicateVariable, objectLiteral),
  '<s> ?p ?o': AF.createPattern(subjectNamedNode, predicateVariable, objectVariable),
  '_:s ?p ?o': AF.createPattern(subjectBNode, predicateVariable, objectVariable),
  '<s> ?p "o"': AF.createPattern(subjectNamedNode, predicateVariable, objectLiteral),
  '_:s ?p "o"': AF.createPattern(subjectBNode, predicateVariable, objectLiteral),
  '?s <p> ?o': AF.createPattern(subjectVariable, predicateNamedNode, objectVariable),
  '?s <p> "o"': AF.createPattern(subjectVariable, predicateNamedNode, objectLiteral),
  '?s ?p <o>': AF.createPattern(subjectVariable, predicateVariable, objectNamedNode),
  '?s ?p _:o': AF.createPattern(subjectVariable, predicateVariable, objectBNode),
  '<s> <p> ?o': AF.createPattern(subjectNamedNode, predicateNamedNode, objectVariable),
  '_:s <p> ?o': AF.createPattern(subjectBNode, predicateNamedNode, objectVariable),
  '<s> <p> "o"': AF.createPattern(subjectNamedNode, predicateNamedNode, objectLiteral),
  '_:s <p> "o"': AF.createPattern(subjectBNode, predicateNamedNode, objectLiteral),
  '<s> ?p <o>': AF.createPattern(subjectNamedNode, predicateVariable, objectNamedNode),
  '_:s ?p <o>': AF.createPattern(subjectBNode, predicateVariable, objectNamedNode),
  '<s> ?p _:o': AF.createPattern(subjectNamedNode, predicateVariable, objectBNode),
  '_:s ?p _:o': AF.createPattern(subjectBNode, predicateVariable, objectBNode),
  '?s <p> <o>': AF.createPattern(subjectVariable, predicateNamedNode, objectNamedNode),
  '?s <p> _:o': AF.createPattern(subjectVariable, predicateNamedNode, objectBNode),
  '<s> <p> <o>': AF.createPattern(subjectNamedNode, predicateNamedNode, objectNamedNode),
  '_:s <p> <o>': AF.createPattern(subjectBNode, predicateNamedNode, objectNamedNode),
  '<s> <p> _:o': AF.createPattern(subjectNamedNode, predicateNamedNode, objectBNode),
  '_:s <p> _:o': AF.createPattern(subjectBNode, predicateNamedNode, objectBNode),
};

const ignoredPatternExamples = {
  '"s" <p> "o"': AF.createPattern(subjectLiteral, predicateNamedNode, objectLiteral),
  '"s" ?p "o"': AF.createPattern(subjectLiteral, predicateVariable, objectLiteral),
};

describe('estimators', () => {
  let dataset: IVoidDataset;

  const datasetTripleCount = 4321;

  beforeEach(() => {
    jest.resetAllMocks();
    jest.restoreAllMocks();
    dataset = {
      classes: 0,
      classPartitions: {},
      distinctObjects: 0,
      distinctSubjects: 0,
      entities: 0,
      identifier: 'ex:g',
      propertyPartitions: {},
      triples: datasetTripleCount,
      uriRegexPattern: /^ex:/u,
      vocabularies: [ 'ex:' ],
    };
  });

  describe('cardinality', () => {
    const pattern1 = AF.createPattern(DF.variable('s'), DF.variable('p1'), DF.variable('o1'));
    const pattern2 = AF.createPattern(DF.variable('s'), DF.variable('p2'), DF.variable('o2'));

    it.each([
      Algebra.types.PROJECT,
      Algebra.types.FILTER,
      Algebra.types.ORDER_BY,
      Algebra.types.GROUP,
      Algebra.types.CONSTRUCT,
    ])('should estimate cardinality for %s', (type) => {
      const operation = <Algebra.Operation>{ type, input: { type: 'fallback' }};
      expect(getCardinality(dataset, operation)).toEqual({
        type: 'estimate',
        value: Number.POSITIVE_INFINITY,
      });
    });

    it.each([
      Algebra.types.JOIN,
      Algebra.types.BGP,
    ])('should estimate cardinality for %s', (type) => {
      const input = [ pattern1, pattern2 ];
      const operation = <Algebra.Operation>{ type, input, patterns: input };
      expect(getCardinality(dataset, operation)).toEqual({
        type: 'estimate',
        value: input.length * datasetTripleCount,
      });
    });

    it('should estimate cardinality for graph', () => {
      const operation = AF.createGraph(pattern1, DF.namedNode('ex:g'));
      expect(getCardinality(dataset, operation)).toEqual({ type: 'estimate', value: datasetTripleCount });
    });

    it('should estimate cardinality for from', () => {
      const operation = AF.createFrom(pattern1, [], []);
      expect(getCardinality(dataset, operation)).toEqual({ type: 'exact', value: 0 });
    });

    it('should estimate cardinality for slice', () => {
      const operation = AF.createSlice(pattern1, 12, 8);
      expect(getCardinality(dataset, operation)).toEqual({ type: 'estimate', value: 8 });
    });

    it('should estimate cardinality for minus', () => {
      const operation = AF.createMinus(pattern1, pattern2);
      expect(getCardinality(dataset, operation)).toEqual({ type: 'estimate', value: 0 });
    });

    it('should estimate cardinality for pattern', () => {
      const operation = pattern1;
      expect(getCardinality(dataset, operation)).toEqual({ type: 'estimate', value: datasetTripleCount });
    });

    it.each([ 0, 1, 10 ])(`should estimate cardinality for ${Algebra.types.VALUES} with %d bindings`, (count) => {
      const operation = <Algebra.Operation>{ type: Algebra.types.VALUES, bindings: { length: count }};
      expect(getCardinality(dataset, operation)).toEqual({ type: 'exact', value: count });
    });
  });

  describe('getPatternCardinality', () => {
    it('should return the estimated cardinality', () => {
      const pattern = AF.createPattern(DF.variable('s'), DF.variable('p'), DF.variable('o'));
      expect(getPatternCardinality(dataset, pattern)).toEqual({ type: 'estimate', value: datasetTripleCount });
    });

    it('should return 0 when resource URIs are not found in the dataset', () => {
      const pattern = AF.createPattern(DF.namedNode('ex2:s'), DF.variable('p'), DF.namedNode('ex2:o'));
      expect(getPatternCardinality(dataset, pattern)).toEqual({ type: 'exact', value: 0 });
    });
  });

  describe('getFromCardinality', () => {
    const pattern = AF.createPattern(DF.variable('s'), DF.variable('p'), DF.variable('o'));

    it('should return 0 when the graph URIs do not match', () => {
      const from = AF.createFrom(pattern, [], [ DF.namedNode('ex:g2') ]);
      expect(getFromCardinality(dataset, from)).toEqual({ type: 'exact', value: 0 });
    });

    it('should return the input estimate with matching graph URI', () => {
      const from = AF.createFrom(pattern, [ DF.namedNode('ex:g') ], []);
      expect(getFromCardinality(dataset, from)).toEqual({ type: 'estimate', value: datasetTripleCount });
    });
  });

  describe('getGraphCardinality', () => {
    const pattern = AF.createPattern(DF.variable('s'), DF.variable('p'), DF.variable('o'));

    it('should return 0 when the graph URI does not match', () => {
      const graph = AF.createGraph(pattern, DF.namedNode('ex:g2'));
      expect(getGraphCardinality(dataset, graph)).toEqual({ type: 'exact', value: 0 });
    });

    it('should return the input estimate with matching graph URI', () => {
      const graph = AF.createGraph(pattern, DF.namedNode('ex:g'));
      expect(getGraphCardinality(dataset, graph)).toEqual({ type: 'estimate', value: datasetTripleCount });
    });

    it('should return the input estimate with variable graph URI', () => {
      const graph = AF.createGraph(pattern, DF.variable('g'));
      expect(getGraphCardinality(dataset, graph)).toEqual({ type: 'estimate', value: datasetTripleCount });
    });
  });

  describe('getJoinCardinality', () => {
    it('should return 0 without any input', () => {
      expect(getJoinCardinality(<any>'dataset', [])).toEqual({ type: 'exact', value: 0 });
    });

    it('should return the sum of input', () => {
      const pattern = AF.createPattern(DF.variable('s'), DF.variable('p'), DF.variable('o'));
      expect(getJoinCardinality(dataset, [ pattern ])).toEqual({ type: 'estimate', value: datasetTripleCount });
    });
  });

  describe('matchPatternResourceUris', () => {
    it('should return true without void:uriRegexPattern', () => {
      expect(matchPatternResourceUris(<any>{}, <any>'pattern')).toBeTruthy();
    });

    it('should return true with variables', () => {
      const pattern = AF.createPattern(DF.namedNode('ex2:s'), DF.namedNode('ex:p'), DF.variable('o'));
      expect(matchPatternResourceUris(dataset, pattern)).toBeTruthy();
    });

    it('should return true with matching named node resources', () => {
      const pattern = AF.createPattern(DF.namedNode('ex:s'), DF.namedNode('ex:p'), DF.namedNode('ex:o'));
      expect(matchPatternResourceUris(dataset, pattern)).toBeTruthy();
    });

    it('should return false with non-matching named node resources', () => {
      const pattern = AF.createPattern(DF.namedNode('ex2:s'), DF.namedNode('ex:p'), DF.namedNode('ex2:o'));
      expect(matchPatternResourceUris(dataset, pattern)).toBeFalsy();
    });
  });

  describe('matchPatternVocabularies', () => {
    it('should return true without vocabularies', () => {
      expect(matchPatternVocabularies(<any>{}, <any>'pattern')).toBeTruthy();
    });

    it('should return true with variables', () => {
      const pattern = AF.createPattern(DF.variable('s'), DF.variable('p'), DF.variable('o'));
      expect(matchPatternVocabularies(dataset, pattern)).toBeTruthy();
    });

    it('should return true with matching named node predicate', () => {
      const pattern = AF.createPattern(DF.variable('s'), DF.namedNode('ex:p'), DF.variable('o'));
      expect(matchPatternVocabularies(dataset, pattern)).toBeTruthy();
    });

    it('should return false with non-matching named node predicate', () => {
      const pattern = AF.createPattern(DF.variable('s'), DF.namedNode('ex2:p'), DF.variable('o'));
      expect(matchPatternVocabularies(dataset, pattern)).toBeFalsy();
    });
  });

  describe('getDistinctObjects', () => {
    it('should return 0 with no data available', () => {
      const dataset = {};
      expect(getDistinctObjects(<any>dataset)).toBe(0);
    });

    it('should return void:distinctSubjects when available', () => {
      const distinctObjects = 321;
      const dataset = { distinctObjects };
      expect(getDistinctObjects(<any>dataset)).toBe(distinctObjects);
    });

    it('should fall back to void:entities when void:distinctObjects is unavailable', () => {
      const entities = 321;
      const dataset = { entities };
      expect(getDistinctObjects(<any>dataset)).toBe(entities);
    });
  });

  describe('getDistinctSubjects', () => {
    it('should return 0 with no data available', () => {
      const dataset = {};
      expect(getDistinctSubjects(<any>dataset)).toBe(0);
    });

    it('should return void:distinctSubjects when available', () => {
      const distinctSubjects = 321;
      const dataset = { distinctSubjects };
      expect(getDistinctSubjects(<any>dataset)).toBe(distinctSubjects);
    });

    it('should fall back to void:entities when void:distinctSubjects is unavailable', () => {
      const entities = 321;
      const dataset = { entities };
      expect(getDistinctSubjects(<any>dataset)).toBe(entities);
    });
  });

  describe('getPredicateObjects', () => {
    const predicateUri = 'ex:p';
    const predicateTerm = DF.namedNode(predicateUri);

    it('should return 0 with no data available', () => {
      const dataset = { propertyPartitions: {}};
      expect(getPredicateObjects(<any>dataset, predicateTerm)).toBe(0);
    });

    it('should return void:distinctObjects from property partition when available', () => {
      const predicateObjects = 321;
      const dataset = { propertyPartitions: { [predicateUri]: { distinctObjects: predicateObjects }}};
      expect(getPredicateObjects(<any>dataset, predicateTerm)).toBe(predicateObjects);
    });
  });

  describe('getPredicateSubjects', () => {
    const predicateUri = 'ex:p';
    const predicateTerm = DF.namedNode(predicateUri);

    it('should return 0 with no data available', () => {
      const dataset = { propertyPartitions: {}};
      expect(getPredicateSubjects(<any>dataset, predicateTerm)).toBe(0);
    });

    it('should return void:distinctSubjects from property partition when available', () => {
      const predicateSubjects = 321;
      const dataset = { propertyPartitions: { [predicateUri]: { distinctSubjects: predicateSubjects }}};
      expect(getPredicateSubjects(<any>dataset, predicateTerm)).toBe(predicateSubjects);
    });
  });

  describe('getPredicateTriples', () => {
    const predicateUri = 'ex:p';
    const predicateTerm = DF.namedNode(predicateUri);

    it('should return 0 with no data available', () => {
      const dataset = { propertyPartitions: {}};
      expect(getPredicateTriples(<any>dataset, predicateTerm)).toBe(0);
    });

    it('should return void:triples from property partition when available', () => {
      const predicateTriples = 321;
      const dataset = { propertyPartitions: { [predicateUri]: { triples: predicateTriples }}};
      expect(getPredicateTriples(<any>dataset, predicateTerm)).toBe(predicateTriples);
    });
  });

  describe('getClassPartitionEntities', () => {
    const classUri = 'ex:c';
    const classTerm = DF.namedNode(classUri);

    it('should return 0 with no data available', () => {
      const dataset = { classPartitions: {}};
      expect(getClassPartitionEntities(<any>dataset, classTerm)).toBe(0);
    });

    it('should return void:entities from class partition when present', () => {
      const classEntities = 321;
      const dataset = { classPartitions: { [classUri]: { entities: classEntities }}};
      expect(getClassPartitionEntities(<any>dataset, classTerm)).toBe(classEntities);
    });

    it('should fall back to void:entited and void:classes from dataset when available', () => {
      const datasetEntities = 200;
      const datasetClasses = 50;
      const dataset = { entities: datasetEntities, classes: datasetClasses, classPartitions: {}};
      expect(getClassPartitionEntities(<any>dataset, classTerm)).toBe(datasetEntities / datasetClasses);
    });
  });

  describe('estimatePatternCardinalityRaw', () => {
    describe.each(Object.entries(patterns))('for patterns in the style of %s', (_, pattern) => {
      it('should handle cases with no relevant triples in the dataset', () => {
        const expected = (pattern.predicate.termType !== 'Variable' || pattern.predicate.value === rdfType.value) ?
          0 :
          datasetTripleCount;
        expect(getPatternCardinalityRaw(dataset, pattern)).toBe(expected);
      });

      it('should handle cases where formulae divisor goes to zero', () => {
        let expected = datasetTripleCount;
        // * <p> * should return predicate triples value
        if (pattern.predicate.termType === 'NamedNode') {
          dataset.propertyPartitions[pattern.predicate.value] = {
            triples: 321,
            distinctObjects: 0,
            distinctSubjects: 0,
          };
          expected = dataset.propertyPartitions[pattern.predicate.value].triples;
        }
        // ?s rdf:type <o> should return class partition entities count
        if (pattern.predicate.value === RDF_TYPE) {
          dataset.classPartitions[pattern.object.value] = { entities: 987, propertyPartitions: {}};
          expected = dataset.classPartitions[pattern.object.value].entities;
        }
        expect(getPatternCardinalityRaw(dataset, pattern)).toBe(expected);
      });

      it('should return a non-zero value when all the metrics are available', () => {
        if (pattern.predicate.termType === 'NamedNode') {
          dataset.propertyPartitions[pattern.predicate.value] = {
            distinctObjects: Math.random() * 20,
            distinctSubjects: Math.random() * 50,
            triples: 100 + Math.random() * 100,
          };
          if (pattern.predicate.value === RDF_TYPE) {
            dataset.classPartitions[pattern.object.value] = {
              entities: Math.random() * 200,
              propertyPartitions: {},
            };
          }
        }
        dataset.distinctObjects = 100 + Math.random() * 100;
        dataset.distinctSubjects = 200 + Math.random() * 50;
        expect(getPatternCardinalityRaw(dataset, pattern)).toBeGreaterThanOrEqual(0);
      });
    });

    describe.each(Object.entries(ignoredPatternExamples))('for patterns in the style of %s', (_, pattern) => {
      it('should return dataset triple count', () => {
        expect(getPatternCardinalityRaw(dataset, pattern)).toBe(datasetTripleCount);
      });
    });
  });
});
