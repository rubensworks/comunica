import type { IActionHttpInvalidate } from '@comunica/bus-http-invalidate';
import { ActionContext, Bus } from '@comunica/core';
import { ActorHttpLimitRate } from '../lib/ActorHttpLimitRate';
import '@comunica/utils-jest';

describe('ActorHttpLimitRate', () => {
  let bus: any;
  let actor: ActorHttpLimitRate;
  let invalidateListeners: ((event: IActionHttpInvalidate) => void)[];

  beforeEach(() => {
    jest.resetAllMocks();
    bus = new Bus({ name: 'bus' });
    invalidateListeners = [];
    actor = new ActorHttpLimitRate({
      bus,
      failureMultiplier: 10,
      historyLength: 10,
      httpInvalidator: <any>{
        addInvalidateListener: jest.fn(listener => invalidateListeners.push(listener)),
      },
      mediatorHttp: <any>{},
      name: 'actor',
    });
  });

  describe('test', () => {
    it('should wrap operation', async() => {
      const context = new ActionContext({});
      await expect(actor.test({ context, input: 'http://localhost' })).resolves.toPassTest({ time: 0 });
    });

    it('should wrap operation only once', async() => {
      const context = new ActionContext({});
      await expect(actor.test({
        context: context.set((<any>ActorHttpLimitRate).keyWrapped, true),
        input: 'http://localhost',
      })).resolves.toFailTest(`${actor.name} can only wrap a request once`);
    });
  });

  describe('run', () => {
    it('should handle successful requests', async() => {
      jest.spyOn(actor, 'waitForSlot').mockResolvedValue(undefined);
      jest.spyOn(actor, 'delayRequest').mockResolvedValue(undefined);
      jest.spyOn(actor, 'enqueueNext').mockReturnValue(undefined);
      jest.spyOn(Date, 'now').mockReturnValue(0);
      // eslint-disable-next-line jest/prefer-spy-on
      (<any>actor).mediatorHttp.mediate = jest.fn().mockResolvedValue({ ok: true });
      const context = new ActionContext({});
      const durations = [ 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 ];
      (<any>actor).hostData.localhost = {
        openRequests: 1,
        concurrentRequestLimit: 1,
        requestQueue: { length: 11 },
        requestDurations: durations,
      };
      await actor.run({ context, input: 'http://localhost/some/uri' });
      expect(durations).toHaveLength(10);
      expect((<any>actor).hostData.localhost.concurrentRequestLimit).toBe(2);
    });

    it('should handle failing requests', async() => {
      jest.spyOn(actor, 'waitForSlot').mockResolvedValue(undefined);
      jest.spyOn(actor, 'delayRequest').mockResolvedValue(undefined);
      jest.spyOn(actor, 'enqueueNext').mockReturnValue(undefined);
      jest.spyOn(Date, 'now').mockReturnValue(0);
      // eslint-disable-next-line jest/prefer-spy-on
      (<any>actor).mediatorHttp.mediate = jest.fn().mockResolvedValue({ ok: false });
      const context = new ActionContext({});
      const durations = [ 1, 2, 3, 4, 5, 6, 7, 8, 9 ];
      (<any>actor).hostData.localhost = {
        openRequests: 1,
        concurrentRequestLimit: 2,
        requestDurations: durations,
      };
      await actor.run({ context, input: 'http://localhost/some/uri' });
      expect(durations).toHaveLength(10);
      expect((<any>actor).hostData.localhost.concurrentRequestLimit).toBe(1);
    });
  });

  describe('enqueueNext', () => {
    it('should enqueue pending requests', async() => {
      const send = jest.fn().mockImplementation(() => {
        (<any>actor).hostData.localhost.openRequests++;
      });
      (<any>actor).hostData.localhost = {
        openRequests: 1,
        concurrentRequestLimit: 4,
        requestQueue: [{ send }, { send }],
      };
      expect(send).not.toHaveBeenCalled();
      actor.enqueueNext('localhost');
      expect(send).toHaveBeenCalledTimes(2);
      expect((<any>actor).hostData.localhost.requestQueue).toHaveLength(0);
    });
  });

  describe('waitForSlot', () => {
    it('should return immediately if free request slot is available', async() => {
      expect((<any>actor).hostData.localhost).toBeUndefined();
      await actor.waitForSlot('localhost');
      expect((<any>actor).hostData.localhost.openRequests).toBe(1);
    });

    it('should add to queue if no free slots are available', async() => {
      (<any>actor).hostData.localhost = {
        openRequests: 1,
        concurrentRequestLimit: 1,
        requestQueue: [],
      };
      const promise = actor.waitForSlot('localhost');
      expect((<any>actor).hostData.localhost.requestQueue).toHaveLength(1);
      // Resolve the promise so it does not remain hanging
      (<any>actor).hostData.localhost.requestQueue[0].send();
      await promise;
    });
  });

  describe('delayRequest', () => {
    it('should do nothing when no prior requests have been recorded', async() => {
      jest.spyOn(globalThis, 'setTimeout').mockImplementation(callback => <any>callback());
      expect(globalThis.setTimeout).not.toHaveBeenCalled();
      (<any>actor).hostData.localhost = { requestDurations: []};
      await expect(actor.delayRequest('localhost')).resolves.toBeUndefined();
      expect(globalThis.setTimeout).not.toHaveBeenCalled();
    });

    it('should wait for an average duration of a prior request', async() => {
      jest.spyOn(globalThis, 'setTimeout').mockImplementation(callback => <any>callback());
      jest.spyOn(Date, 'now').mockReturnValue(0);
      expect(globalThis.setTimeout).not.toHaveBeenCalled();
      (<any>actor).hostData.localhost = {
        requestDurations: [ 10, 20 ],
        latestRequestTimestamp: 0,
      };
      await expect(actor.delayRequest('localhost')).resolves.toBeUndefined();
      expect(globalThis.setTimeout).toHaveBeenCalledTimes(1);
      expect(globalThis.setTimeout).toHaveBeenNthCalledWith(1, expect.any(Function), 15);
    });
  });

  describe('handleHttpInvalidateEvent', () => {
    it('correctly cancels pending requests for the specified url', async() => {
      const url = 'http://localhost/some/url';
      const cancel = jest.fn();
      (<any>actor).hostData.localhost = { requestQueue: [{ cancel }]};
      (<any>actor).hostData.otherhost = { requestQueue: [{ cancel }]};
      expect(cancel).not.toHaveBeenCalled();
      expect(Object.keys((<any>actor).hostData)).toHaveLength(2);
      for (const listener of invalidateListeners) {
        listener({ context: <any>{}, url });
      }
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(Object.keys((<any>actor).hostData)).toHaveLength(1);
    });

    it('correctly cancels all pending requests when url is not specified', async() => {
      const cancel = jest.fn();
      (<any>actor).hostData.localhost = { requestQueue: [{ cancel }]};
      (<any>actor).hostData.otherhost = { requestQueue: [{ cancel }]};
      expect(cancel).not.toHaveBeenCalled();
      expect(Object.keys((<any>actor).hostData)).toHaveLength(2);
      for (const listener of invalidateListeners) {
        listener({ context: <any>{}, url: undefined });
      }
      expect(cancel).toHaveBeenCalledTimes(2);
      expect(Object.keys((<any>actor).hostData)).toHaveLength(0);
    });
  });
});
