import type { IQueryProcessSequential } from '@comunica/bus-query-process';
import { KeysInitQuery } from '@comunica/context-entries';
import { ActionContext, Bus } from '@comunica/core';
import { ActorQueryProcessExplainLogical } from '../lib/ActorQueryProcessExplainLogical';
import '@comunica/utils-jest';

describe('ActorQueryProcessExplainLogical', () => {
  let bus: any;

  beforeEach(() => {
    bus = new Bus({ name: 'bus' });
  });

  describe('An ActorQueryProcessExplainLogical instance', () => {
    let actor: ActorQueryProcessExplainLogical;
    let queryProcessor: IQueryProcessSequential;

    beforeEach(() => {
      queryProcessor = <any>{
        async parse(query: string) {
          return { operation: `${query}PARSE` };
        },
        async optimize(query: string) {
          return { operation: `${query}OPT` };
        },
      };
      actor = new ActorQueryProcessExplainLogical({ name: 'actor', bus, queryProcessor });
    });

    describe('test', () => {
      it('rejects on no explain in context', async() => {
        await expect(actor.test({ query: 'q', context: new ActionContext() }))
          .resolves.toFailTest(`actor can only explain in 'logical' mode.`);
      });

      it('rejects on wrong explain in context', async() => {
        await expect(actor.test({ query: 'q', context: new ActionContext().set(KeysInitQuery.explain, 'parsed') }))
          .resolves.toFailTest(`actor can only explain in 'logical' mode.`);
      });

      it('handles logical explain in context', async() => {
        await expect(actor.test({
          query: 'q',
          context: new ActionContext().set(KeysInitQuery.explain, 'logical'),
        })).resolves
          .toPassTestVoid();
      });

      it('handles logical explain in raw context', async() => {
        await expect(actor.test({ query: 'q', context: new ActionContext().setRaw('explain', 'logical') })).resolves
          .toPassTestVoid();
      });
    });

    describe('run', () => {
      it('handles logical explain in context', async() => {
        await expect(actor.run({
          query: 'q',
          context: new ActionContext().set(KeysInitQuery.explain, 'logical'),
        })).resolves
          .toEqual({
            result: {
              explain: true,
              type: 'logical',
              data: 'qPARSEOPT',
            },
          });
      });
    });
  });
});
