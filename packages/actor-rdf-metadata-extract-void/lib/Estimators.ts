import type * as RDF from '@rdfjs/types';
import { Algebra } from 'sparqlalgebrajs';
import { RDF_TYPE } from './Definitions';
import type { IVoidDataset } from './Types';

/**
 * Estimate the cardinality of the provided operation using the specified dataset metadata.
 * This is the primary function that should be called to perform
 */
export function getCardinality(dataset: IVoidDataset, operation: Algebra.Operation): RDF.QueryResultCardinality {
  switch (operation.type) {
    case Algebra.types.PROJECT:
    case Algebra.types.FILTER:
    case Algebra.types.ORDER_BY:
    case Algebra.types.GROUP:
    case Algebra.types.CONSTRUCT:
      return getCardinality(dataset, operation.input);
    case Algebra.types.PATTERN:
      return getPatternCardinality(dataset, operation);
    case Algebra.types.BGP:
      return getJoinCardinality(dataset, operation.patterns);
    case Algebra.types.JOIN:
      return getJoinCardinality(dataset, operation.input);
    case Algebra.types.GRAPH:
      return getGraphCardinality(dataset, operation);
    case Algebra.types.FROM:
      return getFromCardinality(dataset, operation);
    case Algebra.types.SLICE:
      return getSliceCardinality(dataset, operation);
    case Algebra.types.MINUS:
      return getMinusCardinality(dataset, operation);
    case Algebra.types.VALUES:
      return { type: 'exact', value: operation.bindings.length };
    default:
      return { type: 'estimate', value: Number.POSITIVE_INFINITY };
  }
}

/**
 * Estimate triple pattern cardinality, by first applying heuristics based on void:uriPatternRegex
 * and void:vocabulary data when available, before performing estimations using the formulae.
 */
export function getPatternCardinality(dataset: IVoidDataset, pattern: Algebra.Pattern): RDF.QueryResultCardinality {
  const estimate: RDF.QueryResultCardinality = { type: 'exact', value: 0 };
  if (matchPatternVocabularies(dataset, pattern) && matchPatternResourceUris(dataset, pattern)) {
    const value = getPatternCardinalityRaw(dataset, pattern);
    if (value > 0) {
      estimate.value = value;
      estimate.type = 'estimate';
    }
  }
  return estimate;
}

/**
 * Estimate the cardinality of a minus, by taking into account the input cardinalities.
 */
export function getMinusCardinality(dataset: IVoidDataset, minus: Algebra.Minus): RDF.QueryResultCardinality {
  const estimateFirst = getCardinality(dataset, minus.input[0]);
  const estimateSecond = getCardinality(dataset, minus.input[1]);
  return { type: 'estimate', value: Math.max(estimateFirst.value - estimateSecond.value, 0) };
}

/**
 * Estimate the cardinality of a slice operation, taking into account the input cardinality and the slice range.
 */
export function getSliceCardinality(dataset: IVoidDataset, slice: Algebra.Slice): RDF.QueryResultCardinality {
  const estimate = getCardinality(dataset, slice.input);
  if (estimate.value > 0) {
    estimate.value = Math.max(estimate.value - slice.start, 0);
    if (slice.length !== undefined) {
      estimate.value = Math.min(estimate.value, slice.length);
    }
  }
  return estimate;
}

/**
 * Estimate the cardinality of a from statement, by checking if any of the declared graphs
 * match the current one, and then returning the appropriate estimate.
 */
export function getFromCardinality(dataset: IVoidDataset, from: Algebra.From): RDF.QueryResultCardinality {
  if (
    from.default.some(nn => nn.value === dataset.identifier) ||
    from.named.some(nn => nn.value === dataset.identifier)
  ) {
    return getCardinality(dataset, from.input);
  }
  return { type: 'exact', value: 0 };
}

/**
 * Estimate the cardinality of a statement wrapped under a graph, by also checking if the graph exists.
 */
export function getGraphCardinality(dataset: IVoidDataset, graph: Algebra.Graph): RDF.QueryResultCardinality {
  if (graph.name.termType === 'Variable' || graph.name.value === dataset.identifier) {
    return getCardinality(dataset, graph.input);
  }
  return { type: 'exact', value: 0 };
}

/**
 * Estimate the cardinality of a join, using a sum of the individual input cardinalities.
 * This should result in a somewhat acceptable estimate that will likely be above the probable join plan,
 * but still below an unreasonably high and unlikely cartesian estimate.
 */
export function getJoinCardinality(dataset: IVoidDataset, operations: Algebra.Operation[]): RDF.QueryResultCardinality {
  const estimate: RDF.QueryResultCardinality = { type: 'exact', value: 0 };
  for (const input of operations) {
    const cardinality = getCardinality(dataset, input);
    if (cardinality.value > 0) {
      estimate.type = 'estimate';
      estimate.value += cardinality.value;
    }
  }
  return estimate;
}

/**
 * Test whether the given albegra pattern could produce answers from a dataset with the specified resourceUriPattern.
 * Specifically, if both subject and object are IRIs, but neither matches the resourceUriPattern,
 * then the dataset does not contain any RDF resources that would satisfy the pattern.
 */
export function matchPatternResourceUris(dataset: IVoidDataset, pattern: Algebra.Pattern): boolean {
  return (
    !dataset.uriRegexPattern ||
    (pattern.subject.termType !== 'NamedNode' || dataset.uriRegexPattern.test(pattern.subject.value)) ||
    (pattern.object.termType !== 'NamedNode' || dataset.uriRegexPattern.test(pattern.object.value))
  );
}

/**
 * Test whether the given algebra pattern could produce answers from a dataset with the specified vocabularies.
 * Specifically, if the predicate if an IRI but it does not use any of the specifiec vocabularies,
 * then the pattern cannot be answered by the dataset.
 */
export function matchPatternVocabularies(dataset: IVoidDataset, pattern: Algebra.Pattern): boolean {
  if (dataset.vocabularies !== undefined && pattern.predicate.termType === 'NamedNode') {
    return dataset.vocabularies.some(vc => pattern.predicate.value.startsWith(vc));
  }
  return true;
}

/**
 * Estimate the triple pattern cardinality using the formulae from Hagedorn, Stefan, et al.
 * "Resource Planning for SPARQL Query Execution on Data Sharing Platforms." COLD 1264 (2014)
 */
export function getPatternCardinalityRaw(dataset: IVoidDataset, pattern: Algebra.Pattern): number {
  // ?s rdf:type <o> (from the original paper)
  // ?s rdf:type _:o (also accounted for)
  if (
    pattern.subject.termType === 'Variable' &&
    pattern.predicate.termType === 'NamedNode' &&
    pattern.predicate.value === RDF_TYPE &&
    (pattern.object.termType === 'NamedNode' || pattern.object.termType === 'BlankNode')
  ) {
    return getClassPartitionEntities(dataset, pattern.object);
  }
  // ?s ?p ?o (from the original paper)
  if (
    pattern.subject.termType === 'Variable' &&
    pattern.predicate.termType === 'Variable' &&
    pattern.object.termType === 'Variable'
  ) {
    return dataset.triples;
  }
  // <s> ?p ?o (from the original paper)
  // _:s ?p ?o (also accounted for)
  // <s> ?p "o"
  // _:s ?p "o"
  if (
    (pattern.subject.termType === 'NamedNode' || pattern.subject.termType === 'BlankNode') &&
    pattern.predicate.termType === 'Variable' &&
    (pattern.object.termType === 'Variable' || pattern.object.termType === 'Literal')
  ) {
    const distinctSubjects = getDistinctSubjects(dataset);
    return distinctSubjects > 0 ? dataset.triples / distinctSubjects : dataset.triples;
  }
  // ?s <p> ?o (from the original paper)
  // ?s <p> "o" (also accounted for)
  if (
    pattern.subject.termType === 'Variable' &&
    pattern.predicate.termType === 'NamedNode' &&
    (pattern.object.termType === 'Variable' || pattern.object.termType === 'Literal')
  ) {
    return getPredicateTriples(dataset, pattern.predicate);
  }
  // ?s ?p <o> (from the original paper)
  // ?s ?p _:o (also accounted for)
  // ?s ?p "o"
  if (
    pattern.subject.termType === 'Variable' &&
    pattern.predicate.termType === 'Variable' &&
    (
      pattern.object.termType === 'NamedNode' ||
      pattern.object.termType === 'BlankNode' ||
      pattern.object.termType === 'Literal'
    )
  ) {
    const distinctObjects = getDistinctObjects(dataset);
    return distinctObjects > 0 ? dataset.triples / distinctObjects : dataset.triples;
  }
  // <s> <p> ?o (from the original paper)
  // _:s <p> ?o (also accounted for)
  // <s> <p> "o"
  // _:s <p> "o"
  if (
    (pattern.subject.termType === 'NamedNode' || pattern.subject.termType === 'BlankNode') &&
    pattern.predicate.termType === 'NamedNode' &&
    (pattern.object.termType === 'Variable' || pattern.object.termType === 'Literal')
  ) {
    const predicateTriples = getPredicateTriples(dataset, pattern.predicate);
    const predicateSubjects = getPredicateSubjects(dataset, pattern.predicate);
    return predicateSubjects > 0 ? predicateTriples / predicateSubjects : predicateTriples;
  }
  // <s> ?p <o> (from the original paper)
  // _:s ?p _:o (also accounted for)
  // _:s ?p <o>
  // <s> ?p _:o
  if (
    (pattern.subject.termType === 'NamedNode' || pattern.subject.termType === 'BlankNode') &&
    pattern.predicate.termType === 'Variable' &&
    (pattern.object.termType === 'NamedNode' || pattern.object.termType === 'BlankNode')
  ) {
    const distinctSubjects = getDistinctSubjects(dataset);
    const distinctObjects = getDistinctObjects(dataset);
    return distinctSubjects > 0 && distinctObjects > 0 ?
      dataset.triples / (distinctSubjects * distinctObjects) :
      dataset.triples;
  }
  // ?s <p> <o> (from the original paper)
  // ?s <p> _:o (also accounted for)
  if (
    pattern.subject.termType === 'Variable' &&
    pattern.predicate.termType === 'NamedNode' &&
    (pattern.object.termType === 'NamedNode' || pattern.object.termType === 'BlankNode')
  ) {
    const predicateTriples = getPredicateTriples(dataset, pattern.predicate);
    const predicateObjects = getPredicateObjects(dataset, pattern.predicate);
    return predicateObjects > 0 ? predicateTriples / predicateObjects : predicateTriples;
  }
  // <s> <p> <o> (from the original paper)
  // _:s <p> _:o (also accounted for)
  // <s> <p> _:o
  // _:s <p> <o>
  if (
    (pattern.subject.termType === 'NamedNode' || pattern.subject.termType === 'BlankNode') &&
    pattern.predicate.termType === 'NamedNode' &&
    (pattern.object.termType === 'NamedNode' || pattern.object.termType === 'BlankNode')
  ) {
    const predicateTriples = getPredicateTriples(dataset, pattern.predicate);
    const predicateSubjects = getPredicateSubjects(dataset, pattern.predicate);
    const predicateObjects = getPredicateObjects(dataset, pattern.predicate);
    return predicateSubjects > 0 && predicateObjects > 0 ?
      predicateTriples / (predicateSubjects * predicateObjects) :
      predicateTriples;
  }

  // In all other cases, return the total triple count as absolute upper bound
  return dataset.triples;
}

/**
 * Attempts to retrieve void:distinctObjects, falls back to void:entities
 */
export function getDistinctObjects(dataset: IVoidDataset): number {
  return dataset.distinctObjects ?? dataset.entities ?? 0;
}

/**
 * Attempts to retrieve void:distinctSubjects, falls back to void:entities
 */
export function getDistinctSubjects(dataset: IVoidDataset): number {
  return dataset.distinctSubjects ?? dataset.entities ?? 0;
}

export function getPredicateObjects(dataset: IVoidDataset, predicate: RDF.Term): number {
  return dataset.propertyPartitions[predicate.value]?.distinctObjects ?? 0;
}

export function getPredicateSubjects(dataset: IVoidDataset, predicate: RDF.Term): number {
  return dataset.propertyPartitions[predicate.value]?.distinctSubjects ?? 0;
}

export function getPredicateTriples(dataset: IVoidDataset, predicate: RDF.Term): number {
  return dataset.propertyPartitions[predicate.value]?.triples ?? 0;
}

/**
 * Attempts to retrieve void:entities from class partition,
 * falls back to estimation based on total entities and classes.
 */
export function getClassPartitionEntities(dataset: IVoidDataset, object: RDF.Term): number {
  if (dataset.classPartitions[object.value]) {
    return dataset.classPartitions[object.value].entities;
  }
  if (dataset.entities > 0 && dataset.classes > 0) {
    return dataset.entities / dataset.classes;
  }
  return 0;
}
