import type { MediatorHttp } from '@comunica/bus-http';
import type { IActionHttpInvalidate } from '@comunica/bus-http-invalidate';
import { ActionContext, Bus } from '@comunica/core';
import { ActorHttpLimitRate } from '../lib/ActorHttpLimitRate';
import '@comunica/utils-jest';

describe('ActorHttpLimitRate', () => {
  let bus: any;
  let actor: ActorHttpLimitRate;
  let mediatorHttp: MediatorHttp;
  let actorHostData: Map<string, { requestInterval: number; latestRequestTimestamp: number; rateLimited: boolean }>;
  let invalidateListeners: ((event: IActionHttpInvalidate) => void)[];

  const correctionMultiplier = 0.1;
  const failureMultiplier = 10;

  const url = 'http://localhost:3000/some/url';
  const host = 'localhost:3000';

  beforeEach(() => {
    jest.resetAllMocks();
    jest.restoreAllMocks();
    bus = new Bus({ name: 'bus' });
    invalidateListeners = [];
    mediatorHttp = <any>{
      mediate: jest.fn().mockRejectedValue(new Error('mediatorHttp.mediate')),
    };
    actor = new ActorHttpLimitRate({
      bus,
      correctionMultiplier,
      failureMultiplier,
      limitByDefault: false,
      allowOverlap: false,
      httpInvalidator: <any>{
        addInvalidateListener: jest.fn(listener => invalidateListeners.push(listener)),
      },
      mediatorHttp,
      name: 'actor',
    });
    actorHostData = (<any>actor).hostData;
    jest.spyOn((<any>actor), 'logDebug').mockImplementation((...args) => (<() => unknown>args[2])());
  });

  describe('test', () => {
    it('should wrap operation', async() => {
      const context = new ActionContext({});
      await expect(actor.test({ context, input: url })).resolves.toPassTest({ time: 0 });
    });

    it('should wrap operation only once', async() => {
      const context = new ActionContext({});
      await expect(actor.test({
        context: context.set((<any>ActorHttpLimitRate).keyWrapped, true),
        input: url,
      })).resolves.toFailTest(`${actor.name} can only wrap a request once`);
    });
  });

  describe('run', () => {
    it('should handle successful requests', async() => {
      const response = { ok: true };
      const duration = 100;
      jest.spyOn(Date, 'now').mockReturnValueOnce(0).mockReturnValueOnce(duration);
      jest.spyOn(mediatorHttp, 'mediate').mockResolvedValue(<any>response);
      jest.spyOn(globalThis, 'setTimeout').mockImplementation(callback => <any>callback());
      const action = { context: new ActionContext({}), input: url };
      expect(actorHostData.has(host)).toBeFalsy();
      await expect(actor.run(action)).resolves.toEqual(response);
      expect(globalThis.setTimeout).not.toHaveBeenCalled();
      expect(actorHostData.get(host)).toEqual({
        requestInterval: duration * correctionMultiplier,
        latestRequestTimestamp: 0,
        rateLimited: false,
      });
    });

    it('should delay requests when host is rate limited', async() => {
      const response = { ok: true };
      const interval = 100;
      const responseTime = 200;
      jest.spyOn(Date, 'now').mockReturnValueOnce(0).mockReturnValueOnce(responseTime);
      jest.spyOn(mediatorHttp, 'mediate').mockResolvedValue(<any>response);
      jest.spyOn(globalThis, 'setTimeout').mockImplementation(callback => <any>callback());
      actorHostData.set(host, { latestRequestTimestamp: 0, rateLimited: true, requestInterval: interval });
      const action = { context: new ActionContext({}), input: url };
      await expect(actor.run(action)).resolves.toEqual(response);
      expect(globalThis.setTimeout).toHaveBeenCalledTimes(1);
      expect(globalThis.setTimeout).toHaveBeenNthCalledWith(1, expect.any(Function), interval);
      expect(actorHostData.get(host)).toEqual({
        requestInterval: interval + correctionMultiplier * (responseTime - interval - interval),
        latestRequestTimestamp: interval,
        rateLimited: true,
      });
    });

    it('should delay requests when host is rate limited and overlap is allowed', async() => {
      const response = { ok: true };
      const interval = 100;
      const responseTime = 200;
      (<any>actor).allowOverlap = true;
      jest.spyOn(Date, 'now').mockReturnValueOnce(0).mockReturnValueOnce(responseTime);
      jest.spyOn(mediatorHttp, 'mediate').mockResolvedValue(<any>response);
      jest.spyOn(globalThis, 'setTimeout').mockImplementation(callback => <any>callback());
      actorHostData.set(host, { latestRequestTimestamp: 0, rateLimited: true, requestInterval: interval });
      const action = { context: new ActionContext({}), input: url };
      await expect(actor.run(action)).resolves.toEqual(response);
      expect(globalThis.setTimeout).toHaveBeenCalledTimes(1);
      expect(globalThis.setTimeout).toHaveBeenNthCalledWith(1, expect.any(Function), interval);
      expect(actorHostData.get(host)).toEqual({
        requestInterval: interval + correctionMultiplier * (responseTime - interval - interval),
        // Note: the timestamp should be 0 because the interval is not applied!
        // This is the major difference between the overlap and non-overlap test
        latestRequestTimestamp: 0,
        rateLimited: true,
      });
    });

    it('should delay requests by default when configured to', async() => {
      const duration1 = 100;
      const duration2 = 200;
      const interval1 = duration1 * correctionMultiplier;
      const interval2 = interval1 + correctionMultiplier * (duration2 - interval1 - interval1);
      const response = { ok: true };
      (<any>actor).limitByDefault = true;
      jest.spyOn(Date, 'now')
        .mockReturnValueOnce(0).mockReturnValueOnce(duration1)
        .mockReturnValueOnce(0).mockReturnValueOnce(duration2);
      jest.spyOn(mediatorHttp, 'mediate').mockResolvedValue(<any>response);
      jest.spyOn(globalThis, 'setTimeout').mockImplementation(callback => <any>callback());
      const action = { context: new ActionContext({}), input: url };
      expect(actorHostData.has(host)).toBeFalsy();
      // First call, when the duration is assigned as the delay
      await expect(actor.run(action)).resolves.toEqual(response);
      expect(globalThis.setTimeout).not.toHaveBeenCalled();
      expect(actorHostData.get(host)).toEqual({
        requestInterval: interval1,
        latestRequestTimestamp: 0,
        rateLimited: true,
      });
      // Second call, when the delay is adjusted based on the correction multiplier
      await expect(actor.run(action)).resolves.toEqual(response);
      expect(globalThis.setTimeout).toHaveBeenCalledTimes(1);
      expect(globalThis.setTimeout).toHaveBeenNthCalledWith(1, expect.any(Function), interval1);
      expect(actorHostData.get(host)).toEqual({
        requestInterval: interval2,
        latestRequestTimestamp: interval1,
        rateLimited: true,
      });
    });

    it('should handle failing requests', async() => {
      const duration1 = 400;
      const duration2 = 600;
      const interval1 = duration1 * failureMultiplier * correctionMultiplier;
      const interval2 = interval1 + correctionMultiplier * (failureMultiplier * (duration2 - interval1) - interval1);
      const response = { ok: false };
      jest.spyOn(Date, 'now')
        .mockReturnValueOnce(0).mockReturnValueOnce(duration1)
        .mockReturnValueOnce(0).mockReturnValueOnce(duration2);
      jest.spyOn(mediatorHttp, 'mediate').mockResolvedValue(<any>response);
      jest.spyOn(globalThis, 'setTimeout').mockImplementation(callback => <any>callback());
      const action = { context: new ActionContext({}), input: url };
      expect(actorHostData.has(host)).toBeFalsy();
      // First call, when the duration is assigned as the delay
      await expect(actor.run(action)).resolves.toEqual(response);
      expect(globalThis.setTimeout).not.toHaveBeenCalled();
      expect(actorHostData.get(host)).toEqual({
        requestInterval: interval1,
        latestRequestTimestamp: 0,
        rateLimited: true,
      });
      // Second call, when the delay is adjusted based on the correction multiplier
      await expect(actor.run(action)).resolves.toEqual(response);
      expect(globalThis.setTimeout).toHaveBeenCalledTimes(1);
      expect(globalThis.setTimeout).toHaveBeenNthCalledWith(1, expect.any(Function), interval1);
      expect(actorHostData.get(host)).toEqual({
        requestInterval: interval2,
        latestRequestTimestamp: interval1,
        rateLimited: true,
      });
    });

    it('should forward mediator errors', async() => {
      const errorMessage = 'HTTP error';
      jest.spyOn(Date, 'now').mockReturnValueOnce(0);
      jest.spyOn(Date, 'now').mockReturnValueOnce(100);
      jest.spyOn(mediatorHttp, 'mediate').mockRejectedValue(new Error(errorMessage));
      jest.spyOn(globalThis, 'setTimeout').mockImplementation(callback => <any>callback());
      const action = { context: new ActionContext({}), input: url };
      await expect(actor.run(action)).rejects.toThrow(errorMessage);
      expect(globalThis.setTimeout).not.toHaveBeenCalled();
    });
  });

  describe('handleHttpInvalidateEvent', () => {
    it.each([
      [ 'specific host data when specified', url, 1 ],
      [ 'all host data when not specified', undefined, 0 ],
    ])('correctly clears %s', async(_, url, expectedSize) => {
      actorHostData.set(host, { latestRequestTimestamp: 0, rateLimited: true, requestInterval: 0 });
      actorHostData.set('otherhost:3000', { latestRequestTimestamp: 0, rateLimited: true, requestInterval: 0 });
      expect(actorHostData.size).toBe(2);
      for (const listener of invalidateListeners) {
        listener({ context: <any>{}, url });
      }
      expect(actorHostData.size).toBe(expectedSize);
    });
  });
});
