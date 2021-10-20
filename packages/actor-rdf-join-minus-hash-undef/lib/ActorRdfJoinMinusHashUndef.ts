import type {
  IActionRdfJoin,
  IActorRdfJoinOutputInner,
  IMetadataChecked,
} from '@comunica/bus-rdf-join';
import {
  ActorRdfJoin,
} from '@comunica/bus-rdf-join';
import type { IActorArgs } from '@comunica/core';
import type { IMediatorTypeJoinCoefficients } from '@comunica/mediatortype-join-coefficients';
import type { IActorQueryOperationOutputBindings } from '@comunica/types';
import { TransformIterator } from 'asynciterator';
import { BindingsIndex } from './BindingsIndex';

/**
 * A comunica Minus Hash RDF Join Actor.
 */
export class ActorRdfJoinMinusHashUndef extends ActorRdfJoin {
  public constructor(
    args: IActorArgs<IActionRdfJoin, IMediatorTypeJoinCoefficients, IActorQueryOperationOutputBindings>,
  ) {
    super(args, 'minus', 'hash-undef', 2, undefined, true);
  }

  public async getOutput(action: IActionRdfJoin): Promise<IActorRdfJoinOutputInner> {
    const buffer = action.entries[1].output;
    const output = action.entries[0].output;

    const commonVariables: string[] = ActorRdfJoin.overlappingVariables(action);
    if (commonVariables.length > 0) {
      /**
       * To assure we've filtered all B (`buffer`) values from A (`output`) we wait until we've fetched all values of B.
       * Then we save these triples in `index` and use it to filter our A-stream.
       */
      const index: BindingsIndex = new BindingsIndex(commonVariables);
      const bindingsStream = new TransformIterator(async() => {
        await new Promise(resolve => {
          buffer.bindingsStream.on('data', data => index.add(data));
          buffer.bindingsStream.on('end', resolve);
        });
        return output.bindingsStream.filter(data => !index.contains(data));
      }, { autoStart: false });
      const canContainUndefs = buffer.canContainUndefs || output.canContainUndefs;
      return {
        result: {
          type: 'bindings',
          bindingsStream,
          variables: output.variables,
          metadata: output.metadata,
          canContainUndefs,
        },
      };
    }
    return {
      result: output,
    };
  }

  protected async getJoinCoefficients(
    action: IActionRdfJoin,
    metadatas: IMetadataChecked[],
  ): Promise<IMediatorTypeJoinCoefficients> {
    const requestInitialTimes = ActorRdfJoin.getRequestInitialTimes(metadatas);
    const requestItemTimes = ActorRdfJoin.getRequestItemTimes(metadatas);
    return {
      // Slightly increase iteration cost, as operations in our BindingsIndex do not happen in constant time
      // This enables the mediator to favor other minus actors,
      // while this one will only be selected when streams contain undefs.
      iterations: (metadatas[0].cardinality + metadatas[1].cardinality) * 1.01,
      persistedItems: metadatas[0].cardinality,
      blockingItems: metadatas[0].cardinality,
      requestTime: requestInitialTimes[0] + metadatas[0].cardinality * requestItemTimes[0] +
        requestInitialTimes[1] + metadatas[1].cardinality * requestItemTimes[1],
    };
  }
}