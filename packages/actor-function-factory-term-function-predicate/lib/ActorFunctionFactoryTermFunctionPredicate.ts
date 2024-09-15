import type {
  IActionFunctionFactory,
  IActorFunctionFactoryArgs,
  IActorFunctionFactoryOutput,
  IActorFunctionFactoryOutputTerm,
} from '@comunica/bus-function-factory';
import {
  ActorFunctionFactoryDedicated,
} from '@comunica/bus-function-factory';

import { SparqlOperator } from '@comunica/expression-evaluator';
import { TermFunctionPredicate } from './TermFunctionPredicate';

/**
 * A comunica TermFunctionPredicate Function Factory Actor.
 */
export class ActorFunctionFactoryTermFunctionPredicate extends ActorFunctionFactoryDedicated {
  public constructor(args: IActorFunctionFactoryArgs) {
    super(args, [ SparqlOperator.PREDICATE ], true);
  }

  public async run<T extends IActionFunctionFactory>(_: T):
  Promise<T extends { requireTermExpression: true } ? IActorFunctionFactoryOutputTerm : IActorFunctionFactoryOutput> {
    return new TermFunctionPredicate();
  }
}
