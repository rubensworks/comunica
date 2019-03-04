import { ArrayIterator } from 'asynciterator';
import { Iterable, List, Map, Seq, Set } from "immutable";
import { termToString } from 'rdf-string';
import { Algebra } from "sparqlalgebrajs";

import {
  ActorQueryOperation,
  ActorQueryOperationTypedMediated,
  Bindings,
  IActorQueryOperationOutputBindings,
  IActorQueryOperationTypedMediatedArgs,
} from "@comunica/bus-query-operation";
import { ActionContext, IActorTest } from "@comunica/core";
import { BaseAggregator, createAggregator } from './Aggregators';

/**
 * A comunica Group Query Operation Actor.
 */
export class ActorQueryOperationGroup extends ActorQueryOperationTypedMediated<Algebra.Group> {

  constructor(args: IActorQueryOperationTypedMediatedArgs) {
    super(args, 'group');
  }

  public async testOperation(pattern: Algebra.Group, context: ActionContext): Promise<IActorTest> {
    return pattern.type === 'group';
  }

  public async runOperation(pattern: Algebra.Group, context: ActionContext)
    : Promise<IActorQueryOperationOutputBindings> {

    // Get result stream for the input query
    const { input, aggregates } = pattern;
    const outputRaw = await this.mediatorQueryOperation.mediate({ operation: input, context });
    const output = ActorQueryOperation.getSafeBindings(outputRaw);
    ActorQueryOperation.validateQueryOutput(output, 'bindings');

    // The variables in scope are the variables on which we group, e.g. pattern.variables
    // for 'GROUP BY ?x, ?z', this is [?x, ?z], for 'GROUP by expr(?x) as ?e' this is [?e].
    // But also in scope are the variables defined by the aggregations, since GROUP has to handle this
    const variables = pattern.variables
      .map((variable) => termToString(variable))
      .concat(aggregates.map((agg) => termToString(agg.variable)));

    // TODO: Can be empty (test behaviour) when implicit group by
    // either it's in pattern.variables or it is not
    const patternVariables = Set(pattern.variables.map((v) => termToString(v)));
    const aggregateVariables = Set(aggregates.map(({ variable }) => termToString(variable)));

    let groups: Map<Bindings, Map<string, BaseAggregator<any>>> = Map();

    // Phase 1: Consume the stream, identify the groups and populate the aggregate bindings
    output.bindingsStream.on('data', (bindings: Bindings) => {
      // Select the bindings on which we group
      const grouper = bindings.filter((term, variable) => patternVariables.has(variable)).toMap();

      // New group
      if (!groups.has(grouper)) {
        // Initialize state for all aggregators for new group
        const newAggregators: Map<string, BaseAggregator<any>> = Map(aggregates.map(
          (aggregate) => [termToString(aggregate.variable), createAggregator(aggregate)]));
        groups = groups.set(grouper, newAggregators);
      }

      // For all the aggregate variables we update the corresponding aggregator
      // with the corresponding from the bindings
      const aggregators = groups.get(grouper);
      aggregateVariables.forEach((variable) => {
        aggregators.get(variable).put(bindings.get(variable));
      });
    });

    // Phase 2: Collect aggregator results
    // We can only return when the binding stream ends, when that happens
    // we return the groups identified (which are nothing more than Bindings)
    // and we merge that with the aggregate bindings for that group
    return new Promise((resolve, reject) => {
      output.bindingsStream.on('end', () => {
        // Collect groups
        const rows: Bindings[] = groups.map((aggregators, groupBindings) => {
          // Collect aggregator bindings
          const aggBindings = aggregators.map((aggregator) => aggregator.result());

          // Merge grouping bindings and aggregator bindings
          return groupBindings.merge(aggBindings);
        }).toArray();

        const bindingsStream = new ArrayIterator(rows);
        const metadata = output.metadata;
        resolve({ type: 'bindings', bindingsStream, metadata, variables });
      });

      output.bindingsStream.on('error', (err) => {
        reject(err);
      });
    });
  }

}
