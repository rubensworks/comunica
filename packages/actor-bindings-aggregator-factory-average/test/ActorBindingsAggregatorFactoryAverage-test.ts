import { ActionContext, Bus } from '@comunica/core';
import { ExpressionEvaluatorFactory } from '@comunica/expression-evaluator';
import { BF, DF, makeAggregate } from '@comunica/jest';
import type { IExpressionEvaluatorFactory } from '@comunica/types';
import { ArrayIterator } from 'asynciterator';
import { ActorBindingsAggregatorFactoryAverage } from '../lib';

describe('ActorBindingsAggregatorFactoryAverage', () => {
  let bus: any;
  let expressionEvaluatorFactory: IExpressionEvaluatorFactory;

  beforeEach(() => {
    bus = new Bus({ name: 'bus' });

    const mediatorQueryOperation: any = {
      mediate: (arg: any) => Promise.resolve({
        bindingsStream: new ArrayIterator([
          BF.bindings([[ DF.variable('x'), DF.literal('1') ]]),
          BF.bindings([[ DF.variable('x'), DF.literal('2') ]]),
          BF.bindings([[ DF.variable('x'), DF.literal('3') ]]),
        ], { autoStart: false }),
        metadata: () => Promise.resolve({ cardinality: 3, canContainUndefs: false, variables: [ DF.variable('x') ]}),
        operated: arg,
        type: 'bindings',
      }),
    };

    expressionEvaluatorFactory = new ExpressionEvaluatorFactory({
      mediatorQueryOperation,
      mediatorBindingsAggregatorFactory: mediatorQueryOperation,
    });
  });

  describe('An ActorBindingsAggregatorFactoryCount instance', () => {
    let actor: ActorBindingsAggregatorFactoryAverage;

    beforeEach(() => {
      actor = new ActorBindingsAggregatorFactoryAverage({ name: 'actor', bus });
    });

    describe('test', () => {
      it('accepts average 1', () => {
        return expect(actor.test({
          factory: expressionEvaluatorFactory,
          context: new ActionContext(),
          expr: makeAggregate('avg', false),
        })).resolves.toEqual({});
      });

      it('accepts average 2', () => {
        return expect(actor.test({
          factory: expressionEvaluatorFactory,
          context: new ActionContext(),
          expr: makeAggregate('avg', true),
        })).resolves.toEqual({});
      });

      it('rejects sum', () => {
        return expect(actor.test({
          factory: expressionEvaluatorFactory,
          context: new ActionContext(),
          expr: makeAggregate('sum', false),
        })).rejects.toThrow();
      });
    });

    it('should run', () => {
      return expect(actor.run({
        factory: expressionEvaluatorFactory,
        context: new ActionContext(),
        expr: makeAggregate('avg', false),
      })).resolves.toMatchObject({
        aggregator: expect.anything(),
      });
    });
  });
});
