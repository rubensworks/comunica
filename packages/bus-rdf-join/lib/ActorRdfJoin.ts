import type { MediatorRdfJoinEntriesSort } from '@comunica/bus-rdf-join-entries-sort';
import type {
  MediatorRdfJoinSelectivity,
} from '@comunica/bus-rdf-join-selectivity';
import { KeysInitQuery } from '@comunica/context-entries';
import type { IAction, IActorArgs, Mediate, TestResult } from '@comunica/core';
import { passTest, failTest, Actor } from '@comunica/core';
import type { IMediatorTypeJoinCoefficients } from '@comunica/mediatortype-join-coefficients';
import type {
  IQueryOperationResultBindings,
  MetadataBindings,
  IPhysicalQueryPlanLogger,
  Bindings,
  IActionContext,
  IJoinEntry,
  IJoinEntryWithMetadata,
  ComunicaDataFactory,
  MetadataVariable,
  LogicalJoinType,
} from '@comunica/types';
import { instrumentIterator } from '@comunica/utils-iterator';
import { cachifyMetadata, MetadataValidationState } from '@comunica/utils-metadata';
import type * as RDF from '@rdfjs/types';

/**
 * A comunica actor for joining 2 binding streams.
 *
 * Actor types:
 * * Input:  IActionRdfJoin:                The streams that need to be joined.
 * * Test:   IMediatorTypeJoinCoefficients: Join coefficients.
 * * Output: IActorRdfJoinOutput:           The resulting joined stream.
 *
 * @see IActionRdfJoin
 * @see IActorQueryOperationOutput
 */
export abstract class ActorRdfJoin<TS extends IActorRdfJoinTestSideData = IActorRdfJoinTestSideData> extends Actor<
  IActionRdfJoin,
IMediatorTypeJoinCoefficients,
IQueryOperationResultBindings,
TS
> {
  public readonly mediatorJoinSelectivity: MediatorRdfJoinSelectivity;

  /**
   * If this actor will be logged in the debugger and physical query plan logger
   */
  public includeInLogs = true;
  public readonly logicalType: LogicalJoinType;
  public readonly physicalName: string;
  /**
   * Can be used by subclasses to indicate the max or min number of streams that can be joined.
   * 0 for infinity.
   * By default, this indicates the max number, but can be inverted by setting limitEntriesMin to true.
   */
  protected readonly limitEntries: number;
  /**
   * If true, the limitEntries field is a lower limit,
   * otherwise, it is an upper limit.
   */
  protected readonly limitEntriesMin: boolean;
  /**
   * If this actor can handle undefs overlapping variable bindings.
   */
  protected readonly canHandleUndefs: boolean;
  /**
   * If this join operator will not invoke any other join or query operations below,
   * and can therefore be considered a leaf of the join plan.
   */
  protected readonly isLeaf: boolean;
  /**
   * If this join operator must only be used for join entries with (at least partially) common variables.
   */
  protected readonly requiresVariableOverlap?: boolean;

  /* eslint-disable max-len */
  /**
   * @param args -
   *   \ @defaultNested {<default_bus> a <cc:components/Bus.jsonld#Bus>} bus
   *   \ @defaultNested {RDF joining failed: none of the configured actors were able to handle the join type ${action.type}} busFailMessage
   * @param options - Actor-specific join options.
   */
  /* eslint-enable max-len */
  public constructor(args: IActorRdfJoinArgs<TS>, options: IActorRdfJoinInternalOptions) {
    super(args);
    this.logicalType = options.logicalType;
    this.physicalName = options.physicalName;
    this.limitEntries = options.limitEntries ?? Number.POSITIVE_INFINITY;
    this.limitEntriesMin = options.limitEntriesMin ?? false;
    this.canHandleUndefs = options.canHandleUndefs ?? false;
    this.isLeaf = options.isLeaf ?? true;
    this.requiresVariableOverlap = options.requiresVariableOverlap ?? false;
  }

  /**
   * Returns an array containing all the variable names that occur in all bindings streams.
   * @param {MetadataBindings[]} metadatas An array of optional metadata objects for the entries.
   * @returns {RDF.Variable[]} An array of variables.
   */
  public static overlappingVariables(metadatas: MetadataBindings[]): MetadataVariable[] {
    const variablesIndexed: Record<string, { variable: RDF.Variable; canBeUndef: boolean; occurrences: number }> = {};
    for (const metadata of metadatas) {
      for (const variable of metadata.variables) {
        if (!variablesIndexed[variable.variable.value]) {
          variablesIndexed[variable.variable.value] = {
            variable: variable.variable,
            canBeUndef: variable.canBeUndef,
            occurrences: 0,
          };
        }
        const entry = variablesIndexed[variable.variable.value];
        entry.canBeUndef = entry.canBeUndef || variable.canBeUndef;
        entry.occurrences++;
      }
    }
    return Object.values(variablesIndexed)
      .filter(entry => entry.occurrences === metadatas.length)
      .map(entry => ({ variable: entry.variable, canBeUndef: entry.canBeUndef }));
  }

  /**
   * Returns the variables that will occur in the joined bindings.
   * @param dataFactory The data factory.
   * @param {MetadataBindings[]} metadatas An array of metadata objects for the entries.
   * @param optional If an optional join is being performed.
   * @returns {RDF.Variable[]} An array of joined variables.
   */
  public static joinVariables(
    dataFactory: ComunicaDataFactory,
    metadatas: MetadataBindings[],
    optional = false,
  ): MetadataVariable[] {
    const variablesIndexed: Record<string, boolean> = {};
    let first = true;
    for (const metadata of metadatas) {
      for (const variable of metadata.variables) {
        variablesIndexed[variable.variable.value] = variablesIndexed[variable.variable.value] || variable.canBeUndef ||
          (!first && optional && !(variable.variable.value in variablesIndexed));
      }
      first = false;
    }
    return Object.entries(variablesIndexed)
      .map(([ variableLabel, canBeUndef ]) => ({ variable: dataFactory.variable(variableLabel), canBeUndef }));
  }

  /**
   * Returns the result of joining bindings, or `null` if no join is possible.
   * @param {Bindings[]} bindings
   * @returns {Bindings}
   */

  public static joinBindings(...bindings: Bindings[]): Bindings | null {
    if (bindings.length === 0) {
      return null;
    }
    if (bindings.length === 1) {
      return bindings[0];
    }

    let acc: Bindings = bindings[0];
    for (const binding of bindings.slice(1)) {
      const merged = acc.merge(binding);
      if (!merged) {
        return null;
      }
      acc = merged;
    }
    return acc;
  }

  /**
   * Get the estimated number of items from the given metadata.
   * @param {Record<string, any>} metadata A metadata object.
   * @return {number} The estimated number of items, or `Infinity` if cardinality is falsy.
   */
  public static getCardinality(metadata: MetadataBindings): RDF.QueryResultCardinality {
    return metadata.cardinality;
  }

  /**
   * Obtain the metadata from all given join entries.
   * @param entries Join entries.
   */
  public static async getMetadatas(entries: IJoinEntry[]): Promise<MetadataBindings[]> {
    return await Promise.all(entries.map(entry => entry.output.metadata()));
  }

  /**
   * Obtain the join entries witt metadata from all given join entries.
   * @param entries Join entries.
   */
  public static async getEntriesWithMetadatas(entries: IJoinEntry[]): Promise<IJoinEntryWithMetadata[]> {
    const metadatas = await ActorRdfJoin.getMetadatas(entries);
    return entries.map((entry, i) => ({ ...entry, metadata: metadatas[i] }));
  }

  /**
   * Calculate the time to initiate a request for the given metadata entries.
   * @param metadatas An array of checked metadata.
   */
  public static getRequestInitialTimes(metadatas: MetadataBindings[]): number[] {
    return metadatas.map(metadata => metadata.pageSize ? 0 : metadata.requestTime ?? 0);
  }

  /**
   * Calculate the time to receive a single item for the given metadata entries.
   * @param metadatas An array of checked metadata.
   */
  public static getRequestItemTimes(metadatas: MetadataBindings[]): number[] {
    return metadatas
      .map(metadata => metadata.pageSize ? (metadata.requestTime ?? 0) / metadata.pageSize : 0);
  }

  /**
   * Construct a metadata validation state for the given metadata entries.
   * @param metadatas An array of checked metadata.
   */
  public constructState(metadatas: MetadataBindings[]): MetadataValidationState {
    // Propagate metadata invalidations
    const state = new MetadataValidationState();
    const invalidateListener = (): void => state.invalidate();
    for (const metadata of metadatas) {
      metadata.state.addInvalidateListener(invalidateListener);
    }
    return state;
  }

  /**
   * Helper function to create a new metadata object for the join result.
   * For required metadata entries that are not provided, sane defaults are calculated.
   * @param entries Join entries.
   * @param metadatas Metadata of the join entries.
   * @param context The action context.
   * @param partialMetadata Partial metadata entries.
   * @param optional If metadata for an optional operation must be calculated.
   */
  public async constructResultMetadata(
    entries: IJoinEntry[],
    metadatas: MetadataBindings[],
    context: IActionContext,
    partialMetadata: Partial<MetadataBindings> = {},
    optional = false,
  ): Promise<MetadataBindings> {
    let cardinalityJoined: RDF.QueryResultCardinality;
    if (partialMetadata.cardinality) {
      cardinalityJoined = partialMetadata.cardinality;
    } else {
      let hasZeroCardinality = false;
      cardinalityJoined = metadatas
        .reduce((acc: RDF.QueryResultCardinality, metadata) => {
          const cardinalityThis = ActorRdfJoin.getCardinality(metadata);
          if (cardinalityThis.value === 0) {
            hasZeroCardinality = true;
          }
          return {
            type: cardinalityThis.type === 'estimate' ? 'estimate' : acc.type,
            value: acc.value * (optional ? Math.max(1, cardinalityThis.value) : cardinalityThis.value),
          };
        }, { type: 'exact', value: 1 });
      // The cardinality should only be zero if one of the entries has zero cardinality, not due to float overflow
      if (!hasZeroCardinality) {
        cardinalityJoined.value *= (await this.mediatorJoinSelectivity.mediate({ entries, context })).selectivity;
        if (cardinalityJoined.value === 0) {
          cardinalityJoined.value = Number.MIN_VALUE;
        }
      }
    }

    return {
      state: this.constructState(metadatas),
      ...partialMetadata,
      cardinality: {
        type: cardinalityJoined.type,
        value: cardinalityJoined.value,
      },
      variables: ActorRdfJoin.joinVariables(context.getSafe(KeysInitQuery.dataFactory), metadatas, optional),
    };
  }

  /**
   * Order the given join entries using the join-entries-sort bus.
   * @param {MediatorRdfJoinEntriesSort} mediatorJoinEntriesSort A mediator for sorting join entries.
   * @param {IJoinEntryWithMetadata[]} entries An array of join entries.
   * @param context The action context.
   * @return {IJoinEntryWithMetadata[]} The sorted join entries.
   */
  public static async sortJoinEntries(
    mediatorJoinEntriesSort: MediatorRdfJoinEntriesSort,
    entries: IJoinEntryWithMetadata[],
    context: IActionContext,
  ): Promise<TestResult<IJoinEntryWithMetadata[]>> {
    // If there is a stream that can contain undefs, we don't modify the join order.
    const hasUndefVars = entries.some(entry => entry.metadata.variables.some(variable => variable.canBeUndef));
    if (hasUndefVars) {
      return passTest(entries);
    }

    // Calculate number of occurrences of each variable
    const variableOccurrences: Record<string, number> = {};
    for (const entry of entries) {
      for (const variable of entry.metadata.variables) {
        let counter = variableOccurrences[variable.variable.value];
        if (!counter) {
          counter = 0;
        }
        variableOccurrences[variable.variable.value] = ++counter;
      }
    }

    // Determine variables that occur in at least two join entries
    const multiOccurrenceVariables: string[] = [];
    for (const [ variable, count ] of Object.entries(variableOccurrences)) {
      if (count >= 2) {
        multiOccurrenceVariables.push(variable);
      }
    }

    // Reject if no entries have common variables
    if (multiOccurrenceVariables.length === 0) {
      return failTest(`Bind join can only join entries with at least one common variable`);
    }

    return passTest((await mediatorJoinEntriesSort.mediate({ entries, context })).entries);
  }

  /**
   * Default test function for join actors.
   * Checks whether all iterators have metadata.
   * If yes: call the abstract getIterations method, if not: return Infinity.
   * @param {IActionRdfJoin} action The input action containing the relevant iterators
   * @returns {Promise<IMediatorTypeJoinCoefficients>} The join coefficients.
   */
  public async test(
    action: IActionRdfJoin,
  ): Promise<TestResult<IMediatorTypeJoinCoefficients, TS>> {
    // Validate logical join type
    if (action.type !== this.logicalType) {
      return failTest(`${this.name} can only handle logical joins of type '${this.logicalType}', while '${action.type}' was given.`);
    }

    // Don't allow joining of one or zero streams
    if (action.entries.length <= 1) {
      return failTest(`${this.name} requires at least two join entries.`);
    }

    // Check if this actor can handle the given number of streams
    if (this.limitEntriesMin ? action.entries.length < this.limitEntries : action.entries.length > this.limitEntries) {
      return failTest(`${this.name} requires ${this.limitEntries
      } join entries at ${this.limitEntriesMin ? 'least' : 'most'
      }. The input contained ${action.entries.length}.`);
    }

    // Check if all streams are bindings streams
    for (const entry of action.entries) {
      if (entry.output.type !== 'bindings') {
        // eslint-disable-next-line ts/restrict-template-expressions
        return failTest(`Invalid type of a join entry: Expected 'bindings' but got '${entry.output.type}'`);
      }
    }

    const metadatas = await ActorRdfJoin.getMetadatas(action.entries);

    // Check if this actor can handle undefs (for overlapping variables)
    let overlappingVariables: MetadataVariable[] | undefined;
    if (!this.canHandleUndefs) {
      overlappingVariables = ActorRdfJoin.overlappingVariables(metadatas);
      if (overlappingVariables.some(variable => variable.canBeUndef)) {
        return failTest(`Actor ${this.name} can not join streams containing undefs`);
      }
    }

    // This actor only works with common variables
    if (this.requiresVariableOverlap &&
      (overlappingVariables ?? ActorRdfJoin.overlappingVariables(metadatas)).length === 0) {
      return failTest(`Actor ${this.name} can only join entries with at least one common variable`);
    }

    return await this.getJoinCoefficients(action, { metadatas });
  }

  /**
   * Returns default input for 0 or 1 entries. Calls the getOutput function otherwise
   * @param {IActionRdfJoin} action
   * @param sideData Side data from the test method
   * @returns {Promise<IQueryOperationResultBindings>} A bindings result.
   */
  public async run(
    action: IActionRdfJoin,
    sideData: IActorRdfJoinTestSideData,
  ): Promise<IQueryOperationResultBindings> {
    // Prepare logging to physical plan
    // This must be called before getOutput, because we need to override the plan node in the context
    let parentPhysicalQueryPlanNode;
    if (action.context.has(KeysInitQuery.physicalQueryPlanLogger)) {
      parentPhysicalQueryPlanNode = action.context.get(KeysInitQuery.physicalQueryPlanNode);
      action.context = action.context.set(KeysInitQuery.physicalQueryPlanNode, action);
    }

    // Log to physical plan
    const physicalQueryPlanLogger: IPhysicalQueryPlanLogger | undefined = action.context.get(KeysInitQuery
      .physicalQueryPlanLogger);
    let planMetadata: any;
    if (this.includeInLogs && physicalQueryPlanLogger) {
      planMetadata = {};
      // Stash non-join children, as they will be unstashed later in sub-joins.
      physicalQueryPlanLogger.stashChildren(
        parentPhysicalQueryPlanNode,
        node => node.logicalOperator.startsWith('join'),
      );
      physicalQueryPlanLogger.logOperation(
        `join-${this.logicalType}`,
        this.physicalName,
        action,
        parentPhysicalQueryPlanNode,
        this.name,
        planMetadata,
      );
    }

    // Get action output
    const { result, physicalPlanMetadata } = await this.getOutput(action, sideData);

    // Fill in the physical plan metadata after determining action output
    if (planMetadata) {
      // eslint-disable-next-line ts/no-floating-promises
      instrumentIterator(result.bindingsStream)
        .then((counters) => {
          physicalQueryPlanLogger!.appendMetadata(action, {
            cardinalityReal: counters.count,
            timeSelf: counters.timeSelf,
            timeLife: counters.timeLife,
          });
        });

      Object.assign(planMetadata, physicalPlanMetadata);
      const cardinalities = sideData.metadatas.map(ActorRdfJoin.getCardinality);
      planMetadata.cardinalities = cardinalities;
      planMetadata.joinCoefficients = (await this.getJoinCoefficients(action, sideData)).getOrThrow();

      // If this is a leaf operation, include join entries in plan metadata.
      if (this.isLeaf) {
        for (let i = 0; i < action.entries.length; i++) {
          const entry = action.entries[i];
          physicalQueryPlanLogger!.unstashChild(
            entry.operation,
            action,
          );
          physicalQueryPlanLogger!.appendMetadata(entry.operation, { cardinality: cardinalities[i] });
        }
      }
    }

    // Cache metadata
    result.metadata = cachifyMetadata(result.metadata);

    return result;
  }

  /**
   * Returns the resulting output for joining the given entries.
   * This is called after removing the trivial cases in run.
   * @param {IActionRdfJoin} action
   * @param sideData Side data from the test method
   * @returns {Promise<IActorRdfJoinOutputInner>}
   */
  protected abstract getOutput(
    action: IActionRdfJoin,
    sideData: IActorRdfJoinTestSideData,
  ): Promise<IActorRdfJoinOutputInner>;

  /**
   * Calculate the join coefficients.
   * @param {IActionRdfJoin} action Join action
   * @param sideData The test side data.
   * @returns {IMediatorTypeJoinCoefficients} The join coefficient estimates.
   */
  protected abstract getJoinCoefficients(
    action: IActionRdfJoin,
    sideData: IActorRdfJoinTestSideData,
  ): Promise<TestResult<IMediatorTypeJoinCoefficients, TS>>;
}

export interface IActorRdfJoinArgs<TS extends IActorRdfJoinTestSideData = IActorRdfJoinTestSideData> extends IActorArgs<
  IActionRdfJoin,
  IMediatorTypeJoinCoefficients,
  IQueryOperationResultBindings,
  TS
> {
  mediatorJoinSelectivity: MediatorRdfJoinSelectivity;
}

export interface IActorRdfJoinInternalOptions {
  /**
   * The logical join type this actor can handle.
   */
  logicalType: LogicalJoinType;
  /**
   * The physical name of join operation this actor implements.
   * This is used for debug and query plan logs.
   */
  physicalName: string;
  /**
   * Can be used by subclasses to indicate the max or min number of streams that can be joined.
   * 0 for infinity.
   * By default, this indicates the max number, but can be inverted by setting limitEntriesMin to true.
   */
  limitEntries?: number;
  /**
   * If true, the limitEntries field is a lower limit,
   * otherwise, it is an upper limit.
   * Defaults to false.
   */
  limitEntriesMin?: boolean;
  /**
   * If this actor can handle undefs overlapping variable bindings.
   * Defaults to false.
   */
  canHandleUndefs?: boolean;
  /**
   * If this join operator will not invoke any other join or query operations below,
   * and can therefore be considered a leaf of the join plan.
   * Defaults to true.
   */
  isLeaf?: boolean;
  /**
   * If this join operator must only be used for join entries with (at least partially) common variables.
   */
  requiresVariableOverlap?: boolean;
}

export interface IActionRdfJoin extends IAction {
  /**
   * The logical join type.
   */
  type: LogicalJoinType;
  /**
   * The array of streams to join.
   */
  entries: IJoinEntry[];
}

export interface IActorRdfJoinOutputInner {
  /**
   * The join result.
   */
  result: IQueryOperationResultBindings;
  /**
   * Optional metadata that will be included as metadata within the physical query plan output.
   */
  physicalPlanMetadata?: any;
}

export interface IActorRdfJoinTestSideData {
  metadatas: MetadataBindings[];
}

export type MediatorRdfJoin = Mediate<IActionRdfJoin, IQueryOperationResultBindings, IMediatorTypeJoinCoefficients>;

// TODO remove this in next major version
export { LogicalJoinType } from '@comunica/types';
