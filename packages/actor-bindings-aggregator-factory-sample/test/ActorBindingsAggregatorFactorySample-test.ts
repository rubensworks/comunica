import type { MediatorExpressionEvaluatorFactory } from '@comunica/bus-expression-evaluator-factory';
import { ActionContext, Bus } from '@comunica/core';
import { BF, DF, getMockMediatorExpressionEvaluatorFactory, makeAggregate } from '@comunica/jest';
import { ArrayIterator } from 'asynciterator';
import { ActorBindingsAggregatorFactorySample } from '../lib';

describe('ActorBindingsAggregatorFactorySample', () => {
  let bus: any;
  let mediatorExpressionEvaluatorFactory: MediatorExpressionEvaluatorFactory;

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

    mediatorExpressionEvaluatorFactory = getMockMediatorExpressionEvaluatorFactory({
      mediatorQueryOperation,
    });
  });

  describe('An ActorBindingsAggregatorFactoryMax instance', () => {
    let actor: ActorBindingsAggregatorFactorySample;

    beforeEach(() => {
      actor = new ActorBindingsAggregatorFactorySample({
        name: 'actor',
        bus,
        mediatorExpressionEvaluatorFactory,
      });
    });

    describe('test', () => {
      it('accepts sample 1', () => {
        return expect(actor.test({
          context: new ActionContext(),
          expr: makeAggregate('sample', false),
        })).resolves.toEqual({});
      });

      it('accepts sample 2', () => {
        return expect(actor.test({
          context: new ActionContext(),
          expr: makeAggregate('sample', true),
        })).resolves.toEqual({});
      });

      it('rejects sum', () => {
        return expect(actor.test({
          context: new ActionContext(),
          expr: makeAggregate('sum', false),
        })).rejects.toThrow();
      });
    });

    it('should run', () => {
      return expect(actor.run({
        context: new ActionContext(),
        expr: makeAggregate('sample', false),
      })).resolves.toMatchObject({});
    });
  });
});
