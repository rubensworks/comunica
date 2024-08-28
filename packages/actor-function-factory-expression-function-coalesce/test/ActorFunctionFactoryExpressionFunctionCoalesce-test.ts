import { Bus } from '@comunica/core';
import { ActorFunctionFactoryExpressionFunctionCoalesce } from '../lib/ActorFunctionFactoryExpressionFunctionCoalesce';

describe('ActorFunctionFactoryExpressionFunctionCoalesce', () => {
  let bus: any;

  beforeEach(() => {
    bus = new Bus({ name: 'bus' });
  });

  describe('An ActorFunctionFactoryExpressionFunctionCoalesce instance', () => {
    let actor: ActorFunctionFactoryExpressionFunctionCoalesce;

    beforeEach(() => {
      actor = new ActorFunctionFactoryExpressionFunctionCoalesce({ name: 'actor', bus });
    });

    it('should test', () => {
      return expect(actor.test({ todo: true })).resolves.toEqual({ todo: true }); // TODO
    });

    it('should run', () => {
      return expect(actor.run({ todo: true })).resolves.toMatchObject({ todo: true }); // TODO
    });
  });
});
