import { ActorFunctionFactoryTermAddition } from '@comunica/actor-function-factory-term-addition';
import { TermFunctionEquality } from '@comunica/actor-function-factory-term-equality/lib/TermFunctionEquality';
import { createFuncMediator } from '@comunica/bus-function-factory/test/util';
import * as Eval from '@comunica/utils-expression-evaluator';
import { getMockEEActionContext, getMockEEFactory } from '@comunica/utils-expression-evaluator/test/util/helpers';
import { getMockExpression } from '@comunica/utils-expression-evaluator/test/util/utils';
import { TermFunctionLesserThan } from '../lib/TermFunctionLesserThan';

describe('lesser than', () => {
  describe('on sparql star tripples', () => {
    it('allows Generalized RDF Triples', async() => {
      const op = new TermFunctionLesserThan(new TermFunctionEquality());
      const dg = new Eval.DefaultGraph();
      expect(op.applyOnTerms(
        [
          new Eval.Quad(
            new Eval.IntegerLiteral(2),
            new Eval.IntegerLiteral(2),
            new Eval.IntegerLiteral(2),
            dg,
          ),
          new Eval.Quad(
            new Eval.IntegerLiteral(2),
            new Eval.IntegerLiteral(3),
            new Eval.IntegerLiteral(2),
            dg,
          ),
        ],
        await getMockEEFactory({
          mediatorFunctionFactory: createFuncMediator([
            args => new ActorFunctionFactoryTermAddition(args),
          ], {}),
        }).run({
          algExpr: getMockExpression(),
          context: getMockEEActionContext(),
        }, undefined),
      )).toEqual(new Eval.BooleanLiteral(true));
    });
  });
});
