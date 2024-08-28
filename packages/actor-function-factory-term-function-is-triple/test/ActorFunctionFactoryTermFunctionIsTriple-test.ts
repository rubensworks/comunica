import { Bus } from '@comunica/core';
import { ActorFunctionFactoryTermFunctionIsTriple } from '../lib/ActorFunctionFactoryTermFunctionIsTriple';

describe('ActorFunctionFactoryTermFunctionIsTriple', () => {
  let bus: any;

  beforeEach(() => {
    bus = new Bus({ name: 'bus' });
  });

  describe('An ActorFunctionFactoryTermFunctionIsTriple instance', () => {
    let actor: ActorFunctionFactoryTermFunctionIsTriple;

    beforeEach(() => {
      actor = new ActorFunctionFactoryTermFunctionIsTriple({ name: 'actor', bus });
    });

    it('should test', () => {
      return expect(actor.test({ todo: true })).resolves.toEqual({ todo: true }); // TODO
    });

    it('should run', () => {
      return expect(actor.run({ todo: true })).resolves.toMatchObject({ todo: true }); // TODO
    });
  });
});
