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
import { TermFunctionIsIri } from './TermFunctionIsIri';

/**
 * A comunica TermFunctionIsIri Function Factory Actor.
 */
export class ActorFunctionFactoryTermFunctionIsIri extends ActorFunctionFactoryDedicated {
  public constructor(args: IActorFunctionFactoryArgs) {
    super(args, [ SparqlOperator.IS_IRI, SparqlOperator.IS_URI ], true);
  }

  public async run<T extends IActionFunctionFactory>(_: T):
  Promise<T extends { requireTermExpression: true } ? IActorFunctionFactoryOutputTerm : IActorFunctionFactoryOutput> {
    return new TermFunctionIsIri();
  }
}
