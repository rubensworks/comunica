import { Bus } from '@comunica/core';
import { ActorFunctionFactoryTermFunctionXsdToInteger } from '../lib/ActorFunctionFactoryTermFunctionXsdToInteger';

describe('ActorFunctionFactoryTermFunctionXsdToInteger', () => {
  let bus: any;

  beforeEach(() => {
    bus = new Bus({ name: 'bus' });
  });

  describe('An ActorFunctionFactoryTermFunctionXsdToInteger instance', () => {
    let actor: ActorFunctionFactoryTermFunctionXsdToInteger;

    beforeEach(() => {
      actor = new ActorFunctionFactoryTermFunctionXsdToInteger({ name: 'actor', bus });
    });

    it('should test', () => {
      return expect(actor.test({ todo: true })).resolves.toEqual({ todo: true }); // TODO
    });

    it('should run', () => {
      return expect(actor.run({ todo: true })).resolves.toMatchObject({ todo: true }); // TODO
    });
  });
});
