import type { Algebra } from 'sparqlalgebrajs';
import type { QueryResultCardinality } from './IMetadata';

/**
 * Abstraction to allow grouping of metadata by dataset, in case multiple datasets
 * expose their metadata through the same source URI and thus the same stream.
 */
export interface IDataset {
  /**
   * The unique URI of this dataset.
   */
  uri: string;
  /**
   * The URI from which this dataset was discovered.
   */
  source: string;
  /**
   * Calculate the cardinality of the given operation within this dataset.
   * @param {Algebra.Operation} operation SPARQL algebra operation.
   * @returns {QueryResultCardinality} Upper bound for the cardinality.
   */
  getCardinality: (operation: Algebra.Operation) => Promise<QueryResultCardinality>;
}
