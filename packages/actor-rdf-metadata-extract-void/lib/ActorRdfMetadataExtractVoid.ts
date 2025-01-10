import type { ActorInitQueryBase } from '@comunica/actor-init-query';
import { QueryEngineBase } from '@comunica/actor-init-query';
import type {
  IActionRdfMetadataExtract,
  IActorRdfMetadataExtractOutput,
  IActorRdfMetadataExtractArgs,
} from '@comunica/bus-rdf-metadata-extract';
import { ActorRdfMetadataExtract } from '@comunica/bus-rdf-metadata-extract';
import type { IActorTest, TestResult } from '@comunica/core';
import { passTestVoid } from '@comunica/core';
import type * as RDF from '@rdfjs/types';
import { LRUCache } from 'lru-cache';
import { RdfStore } from 'rdf-stores';
import { termToString } from 'rdf-string-ttl';
import type { Algebra } from 'sparqlalgebrajs';

/**
 * A comunica Void RDF Metadata Extract Actor.
 */
export class ActorRdfMetadataExtractVoid extends ActorRdfMetadataExtract {
  private readonly queryEngine: QueryEngineBase;
  private readonly inferUriRegexPattern: boolean;
  private readonly bindingsCache: LRUCache<string, RDF.Bindings[]>;

  public static readonly VOID = 'http://rdfs.org/ns/void#';
  public static readonly SPARQLSD = 'http://www.w3.org/ns/sparql-service-description#';

  public constructor(args: IActorRdfMetadataExtractVoidArgs) {
    super(args);
    this.queryEngine = new QueryEngineBase(args.actorInitQuery);
    this.inferUriRegexPattern = args.inferUriRegexPattern;
    this.bindingsCache = new LRUCache<string, RDF.Bindings[]>({ max: args.bindingsCacheSize });
  }

  public async test(_action: IActionRdfMetadataExtract): Promise<TestResult<IActorTest>> {
    return passTestVoid();
  }

  public async run(action: IActionRdfMetadataExtract): Promise<IActorRdfMetadataExtractOutput> {
    const store = await this.collectFromMetadata(action.metadata);
    const datasets = await this.getDatasets(store, action.url);
    const metadata = datasets.length > 0 ? { voidDatasets: datasets } : {};

    return { metadata };
  }

  /**
   * Collect all the VoID-related quads from the metadata stream.
   * The purpose of this is to avoid storing unrelated data present in the metadata stream.
   * @param {RDF.Stream} stream The metadata Quad stream.
   * @returns {RDF.Store} An RDF/JS in-memory store containing all the VoID-related quads.
   */
  public async collectFromMetadata(stream: RDF.Stream): Promise<RDF.Store> {
    return new Promise<RDF.Store>((resolve, reject) => {
      const store = RdfStore.createDefault();
      stream
        .on('error', reject)
        .on('end', () => resolve(store))
        .on('data', (quad: RDF.Quad) => {
          if (
            quad.predicate.value.startsWith(ActorRdfMetadataExtractVoid.VOID) ||
            quad.predicate.value.startsWith(ActorRdfMetadataExtractVoid.SPARQLSD) ||
            quad.object.value.startsWith(ActorRdfMetadataExtractVoid.VOID) ||
            quad.object.value.startsWith(ActorRdfMetadataExtractVoid.SPARQLSD)
          ) {
            store.addQuad(quad);
          }
        });
    });
  }

  public async getDatasets(store: RDF.Store, voidDescriptionUrl: string): Promise<IVoidDataset[]> {
    const datasets: IVoidDataset[] = [];

    const query = `
      PREFIX void: <http://rdfs.org/ns/void#>
      PREFIX sd: <http://www.w3.org/ns/sparql-service-description#>
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

      SELECT DISTINCT ?identifier ?uriRegexPattern ?uriSpace WHERE {
        ?identifier rdf:type ?type .

        # First, try to find the uriRegexPattern on the dataset itself
        OPTIONAL {
          ?identifier void:uriRegexPattern ?uriRegexPattern .
        }

        # Then, try to find it on a parent dataset
        OPTIONAL {
          ?var1 sd:defaultGraph ?identifier .
          ?var1 void:uriRegexPattern ?uriRegexPattern .
        }

        # Again, try to find the uriSpace on the dataset itself
        OPTIONAL {
          ?identifier void:uriSpace ?uriSpace .
        }

        # If that fails, try the parent dataset
        OPTIONAL {
          ?var2 sd:defaultGraph ?identifier .
          ?var2 void:uriSpace ?uriSpace .
        }

        # Exclude intermediate defaultDataset from SPARQL SD as not actual graphs
        FILTER NOT EXISTS {
          ?var3 sd:defaultDataset ?identifier .
        }

        # Exclude union default graphs that merely combine every other graph
        FILTER NOT EXISTS {
          ?var4 sd:feature sd:UnionDefaultGraph .
          ?var4 sd:defaultDataset/sd:defaultGraph ?identifier .
        }

        # By definition, sd:Graph and sd:Dataset are both also void:Datasets, however
        # sd:Dataset represents the dataset and not the graph, so it can likely be ignored.
        FILTER(?type IN (sd:Graph,void:Dataset))
      }
    `;

    const queryBindings = await this.queryEngine.queryBindings(query, { sources: [ store ]});

    for await (const bindings of queryBindings) {
      const identifier = bindings.get('identifier')!;
      if (identifier.termType === 'BlankNode' || identifier.termType === 'NamedNode') {
        let uriRegexPattern: RegExp | undefined;
        // The actual pattern should take precedence when available
        if (bindings.has('uriRegexPattern')) {
          uriRegexPattern = new RegExp(bindings.get('uriRegexPattern')!.value, 'u');
        } else if (bindings.has('uriSpace')) {
          uriRegexPattern = new RegExp(`^${bindings.get('uriSpace')?.value}`, 'u');
        } else if (this.inferUriRegexPattern) {
          const url = new URL(identifier.termType === 'NamedNode' ? identifier.value : voidDescriptionUrl);
          uriRegexPattern = new RegExp(`^${url.protocol}//${url.host}`, 'u');
        }

        const dataset: IVoidDataset = {
          identifier,
          store,
          source: voidDescriptionUrl,
          uriRegexPattern,
          vocabularies: await this.getVocabularies(store, identifier),
          estimateCardinality: (pattern: Algebra.Pattern) => this.estimatePatternCardinality(
            dataset,
            pattern,
          ),
        };

        datasets.push(dataset);
      }
    }

    return datasets;
  }

  public async getVocabularies(
    store: RDF.Store,
    identifier: RDF.NamedNode | RDF.BlankNode,
  ): Promise<string[] | undefined> {
    const vocabularies: string[] = [];

    const query = `
      PREFIX void: <http://rdfs.org/ns/void#>
      PREFIX sd: <http://www.w3.org/ns/sparql-service-description#>

      SELECT DISTINCT ?vocabulary WHERE {
        {
          SELECT ?vocabulary WHERE {
            ${termToString(identifier)} void:vocabulary ?vocabulary .
          }
        } UNION {
          SELECT ?vocabulary WHERE {
            ?dataset sd:defaultGraph ${termToString(identifier)} .
            ?dataset void:vocabulary ?vocabulary .
          }
        }
      }
    `;

    const bindingsStream = await this.queryEngine.queryBindings(query, { sources: [ store ]});

    for await (const bindings of bindingsStream) {
      vocabularies.push(bindings.get('vocabulary')!.value);
    }

    return vocabularies.length > 0 ? vocabularies : undefined;
  }

  /**
   * Estimate the triple pattern cardinality using the formulae from Hagedorn, Stefan, et al.
   * "Resource Planning for SPARQL Query Execution on Data Sharing Platforms." COLD 1264 (2014)
   *
   * Additional heuristics are applied based on void:uriPatternRegex and void:vocabulary data when available.
   *
   * @param {IVoidDataset} dataset The dataset to estimate in.
   * @param {Algebra.Pattern} pattern The algebra pattern to estimate for.
   * @returns {RDF.QueryResultCardinality} The estimated query result cardinality.
   */
  public async estimatePatternCardinality(
    dataset: IVoidDataset,
    pattern: Algebra.Pattern,
  ): Promise<RDF.QueryResultCardinality> {
    return (
      this.matchVocabularies(pattern, dataset.vocabularies) &&
      this.matchUriRegexPattern(pattern, dataset.uriRegexPattern)
    ) ?
        { type: 'estimate', value: await this.estimatePatternCardinalityRaw(dataset, pattern) } :
        { type: 'exact', value: 0 };
  }

  /**
   * Test whether the given albegra pattern could produce answers from a dataset with the specified uriPatternRegex.
   * Specifically, if both subject and object are IRIs, but neither matches the uriRegexPattern,
   * then the dataset does not contain any RDF resources that would satisfy the pattern.
   * @param {Algebra.Pattern} pattern The algebra pattern.
   * @param {RegExp | undefined} regex The uriRegexPattern.
   * @returns {boolean} Whether the dataset could contain answers for the given pattern.
   */
  public matchUriRegexPattern(pattern: Algebra.Pattern, regex?: RegExp): boolean {
    return !regex ||
      pattern.subject.termType !== 'NamedNode' ||
      pattern.object.termType !== 'NamedNode' ||
      regex.test(pattern.subject.value) ||
      regex.test(pattern.object.value);
  }

  /**
   * Test whether the given algebra pattern could produce answers from a dataset with the specified vocabularies.
   * Specifically, if the predicate if an IRI but it does not use any of the specifiec vocabularies,
   * then the pattern cannot be answered by the dataset.
   * @param {Algebra.Pattern} pattern The algebra pattern.
   * @param {string[] | undefined} vocabularies The dataset vocabulary list.
   * @returns {boolean} Whether the dataset could contain answers for the given pattern.
   */
  public matchVocabularies(pattern: Algebra.Pattern, vocabularies?: string[]): boolean {
    return !vocabularies ||
      pattern.predicate.termType !== 'NamedNode' ||
      vocabularies.some(vc => pattern.predicate.value.startsWith(vc));
  }

  public async estimatePatternCardinalityRaw(dataset: IVoidDataset, pattern: Algebra.Pattern): Promise<number> {
    // ?s rdf:type <o>
    if (
      pattern.predicate.termType === 'NamedNode' &&
      pattern.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type' &&
      pattern.subject.termType === 'Variable' &&
      pattern.object.termType !== 'Variable'
    ) {
      return await this.getClassPartitionEntities(dataset, pattern.object);
    }

    // ?s ?p ?o
    if (
      pattern.subject.termType === 'Variable' &&
      pattern.predicate.termType === 'Variable' &&
      pattern.object.termType === 'Variable'
    ) {
      return await this.getTriples(dataset);
    }

    // <s> ?p ?o
    if (
      pattern.subject.termType !== 'Variable' &&
      pattern.predicate.termType === 'Variable' &&
      pattern.object.termType === 'Variable'
    ) {
      const graphTriples = await this.getTriples(dataset);
      if (graphTriples === 0) {
        return 0;
      }
      const distinctSubjects = await this.getDistinctSubjects(dataset);
      if (distinctSubjects > 0) {
        return graphTriples / distinctSubjects;
      }
    }

    // ?s <p> ?o
    if (
      pattern.subject.termType === 'Variable' &&
      pattern.predicate.termType === 'NamedNode' &&
      pattern.object.termType === 'Variable'
    ) {
      return this.getPredicateTriples(dataset, pattern.predicate);
    }

    // ?s ?p <o>
    if (
      pattern.subject.termType === 'Variable' &&
      pattern.predicate.termType === 'Variable' &&
      pattern.object.termType !== 'Variable'
    ) {
      const graphTriples = await this.getTriples(dataset);
      if (graphTriples === 0) {
        return 0;
      }
      const distinctObjects = await this.getDistinctObjects(dataset);
      if (distinctObjects > 0) {
        return graphTriples / distinctObjects;
      }
    }

    // <s> <p> ?o
    if (
      pattern.subject.termType !== 'Variable' &&
      pattern.predicate.termType === 'NamedNode' &&
      pattern.object.termType === 'Variable'
    ) {
      const predicateTriples = await this.getPredicateTriples(dataset, pattern.predicate);
      if (predicateTriples === 0) {
        return 0;
      }
      const predicateSubjects = await this.getPredicateSubjects(dataset, pattern.predicate);
      if (predicateSubjects > 0) {
        return predicateTriples / predicateSubjects;
      }
    }

    // <s> ?p <o>
    if (
      pattern.subject.termType !== 'Variable' &&
      pattern.predicate.termType === 'Variable' &&
      pattern.object.termType !== 'Variable'
    ) {
      const graphTriples = await this.getTriples(dataset);
      if (graphTriples === 0) {
        return 0;
      }
      const distinctSubjects = await this.getDistinctSubjects(dataset);
      const distinctObjects = await this.getDistinctObjects(dataset);
      if (distinctSubjects > 0 && distinctObjects > 0) {
        return graphTriples / (distinctSubjects * distinctObjects);
      }
    }

    // ?s <p> <o>
    if (
      pattern.subject.termType === 'Variable' &&
      pattern.predicate.termType === 'NamedNode' &&
      pattern.object.termType !== 'Variable'
    ) {
      const predicateTriples = await this.getPredicateTriples(dataset, pattern.predicate);
      if (predicateTriples === 0) {
        return 0;
      }
      const predicateObjects = await this.getPredicateObjects(dataset, pattern.predicate);
      if (predicateObjects > 0) {
        return predicateTriples / predicateObjects;
      }
    }

    // <s> <p> <o>
    if (
      pattern.subject.termType !== 'Variable' &&
      pattern.predicate.termType === 'NamedNode' &&
      pattern.object.termType !== 'Variable'
    ) {
      const predicateTriples = await this.getPredicateTriples(dataset, pattern.predicate);
      if (predicateTriples === 0) {
        return 0;
      }
      const predicateSubjects = await this.getPredicateSubjects(dataset, pattern.predicate);
      const predicateObjects = await this.getPredicateObjects(dataset, pattern.predicate);
      if (predicateSubjects > 0 && predicateObjects > 0) {
        return predicateTriples / (predicateSubjects * predicateObjects);
      }
    }

    // In all other cases, or when a divisor would go to 0, return infinity
    return Number.POSITIVE_INFINITY;
  }

  public async getTriples(dataset: IVoidDataset): Promise<number> {
    const query = `
      PREFIX void: <http://rdfs.org/ns/void#>

      SELECT ?triples WHERE {
        ${termToString(dataset.identifier)} void:triples ?triples .
      } LIMIT 1
    `;
    const bindings = await this.getBindings(dataset, query);
    return Number.parseInt(bindings.at(0)?.get('triples')?.value ?? '0', 10);
  }

  /**
   * Attempts to retrieve void:distinctSubjects, falls back to void:entities
   */
  public async getDistinctSubjects(dataset: IVoidDataset): Promise<number> {
    const query = `
      PREFIX void: <http://rdfs.org/ns/void#>

      SELECT ?count WHERE {
        OPTIONAL { ${termToString(dataset.identifier)} void:distinctSubjects ?distinctSubjects } .
        OPTIONAL { ${termToString(dataset.identifier)} void:entities ?entities } .

        BIND(COALESCE(?distinctObjects,?entities) AS ?count)
      } LIMIT 1
    `;
    const bindings = await this.getBindings(dataset, query);
    return Number.parseInt(bindings.at(0)?.get('count')?.value ?? '0', 10);
  }

  /**
   * Attempts to retrieve void:distinctObjects, falls back to void:entities
   */
  public async getDistinctObjects(dataset: IVoidDataset): Promise<number> {
    const query = `
      PREFIX void: <http://rdfs.org/ns/void#>

      SELECT ?count WHERE {
        OPTIONAL { ${termToString(dataset.identifier)} void:distinctObjects ?distinctObjects } .
        OPTIONAL { ${termToString(dataset.identifier)} void:entities ?entities } .

        BIND(COALESCE(?distinctObjects,?entities) AS ?count)
      } LIMIT 1
    `;
    const bindings = await this.getBindings(dataset, query);
    return Number.parseInt(bindings.at(0)?.get('count')?.value ?? '0', 10);
  }

  public async getPredicateTriples(dataset: IVoidDataset, predicate: RDF.Term): Promise<number> {
    const query = `
      PREFIX void: <http://rdfs.org/ns/void#>

      SELECT ?triples WHERE {
        ${termToString(dataset.identifier)} void:propertyPartition [
          void:property ${termToString(predicate)} ;
          void:triples ?triples
        ] .
      } LIMIT 1
    `;
    const bindings = await this.getBindings(dataset, query);
    return Number.parseInt(bindings.at(0)?.get('triples')?.value ?? '0', 10);
  }

  public async getPredicateSubjects(dataset: IVoidDataset, predicate: RDF.Term): Promise<number> {
    const query = `
      PREFIX void: <http://rdfs.org/ns/void#>

      SELECT ?distinctSubjects WHERE {
        ${termToString(dataset.identifier)} void:propertyPartition [
          void:property ${termToString(predicate)} ;
          void:distinctSubjects ?distinctSubjects
        ] .
      } LIMIT 1
    `;
    const bindings = await this.getBindings(dataset, query);
    return Number.parseInt(bindings.at(0)?.get('distinctSubjects')?.value ?? '0', 10);
  }

  public async getPredicateObjects(dataset: IVoidDataset, predicate: RDF.Term): Promise<number> {
    const query = `
      PREFIX void: <http://rdfs.org/ns/void#>

      SELECT ?distinctObjects WHERE {
        ${termToString(dataset.identifier)} void:propertyPartition [
          void:property ${termToString(predicate)} ;
          void:distinctObjects ?distinctObjects
        ] .
      } LIMIT 1
    `;
    const bindings = await this.getBindings(dataset, query);
    return Number.parseInt(bindings.at(0)?.get('distinctObjects')?.value ?? '0', 10);
  }

  public async getClassPartitionEntities(dataset: IVoidDataset, object: RDF.Term): Promise<number> {
    const query = `
      PREFIX void: <http://rdfs.org/ns/void#>

      SELECT ?entities WHERE {
        ${termToString(dataset.identifier)} void:classPartition [
          void:class ${termToString(object)} ;
          void:entities ?entities
        ] .
      } LIMIT 1
    `;
    const bindings = await this.getBindings(dataset, query);
    return Number.parseInt(bindings.at(0)?.get('entities')?.value ?? '0', 10);
  }

  public async getBindings(dataset: IVoidDataset, query: string): Promise<RDF.Bindings[]> {
    let bindings = this.bindingsCache.get(query);
    if (!bindings) {
      const bindingsStream = await this.queryEngine.queryBindings(query, { sources: [ dataset.store ]});
      bindings = await bindingsStream.toArray();
      this.bindingsCache.set(query, bindings);
    }
    return bindings;
  }
}

export interface IActorRdfMetadataExtractVoidArgs extends IActorRdfMetadataExtractArgs {
  /**
   * An init query actor that is used to query shapes.
   * @default {<urn:comunica:default:init/actors#query>}
   */
  actorInitQuery: ActorInitQueryBase;
  /**
   * Whether URI regex patterns should be inferred based on dataset URI or
   * void:uriSpace if not present in the VoID description.
   * @default {true}
   */
  inferUriRegexPattern: boolean;
  /**
   * How many bindings results used within the cardinality estimation formulae should be cached.
   * This is done to avoid repeated queries ovet the VoID metadata to extract the same handful of numbers.
   * @default {100}
   */
  bindingsCacheSize: number;
}

/**
 * Comunica-specific wrapper for the VoID dataset description, as defined in the specification:
 * https://www.w3.org/TR/void/
 */
export interface IVoidDataset {
  /**
   * The source IRI of the dataset description.
   */
  source: string;
  /**
   * The identifier of the dataset, either an IRI or a blank node.
   */
  identifier: RDF.NamedNode | RDF.BlankNode;
  /**
   * The RDF/JS store containing the data for this dataset description.
   * Note that the store might also contain data for other datasets defined in the dame VoID description.
   */
  store: RDF.Store;
  /**
   * The regex pattern that is matched by all RDF Resources within this dataset.
   * This corresponds to void:uriRegexPattern and is preferred over void:uriSpace.
   * All void:uriSpace are internally converted into void:uriRegexPattern to keep the implementation consistent.
   * https://www.w3.org/TR/void/#pattern
   */
  uriRegexPattern?: RegExp;
  /**
   * The vocabularies used within the dataset, as listed with void:vocabulary predicates.
   */
  vocabularies?: string[];
  /**
   * Acquire a cardinality estimate for the given triple pattern.
   * @param {Algebra.Pattern} pattern The triple pattern to estimate.
   * @returns {RDF.QueryResultCardinality} The estimated cardinality.
   */
  estimateCardinality: (pattern: Algebra.Pattern) => Promise<RDF.QueryResultCardinality>;
}
