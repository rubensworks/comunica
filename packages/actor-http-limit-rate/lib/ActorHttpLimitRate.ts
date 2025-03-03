import type { IActionHttp, IActorHttpOutput, IActorHttpArgs, MediatorHttp } from '@comunica/bus-http';
import { ActorHttp } from '@comunica/bus-http';
import type { ActorHttpInvalidateListenable, IActionHttpInvalidate } from '@comunica/bus-http-invalidate';
import type { TestResult } from '@comunica/core';
import { ActionContextKey, failTest, passTest } from '@comunica/core';
import type { IMediatorTypeTime } from '@comunica/mediatortype-time';

export class ActorHttpLimitRate extends ActorHttp {
  private readonly hostData: Map<string, IHostData>;
  private readonly correctionMultiplier: number;
  private readonly failureMultiplier: number;
  private readonly limitByDefault: boolean;
  private readonly allowOverlap: boolean;
  private readonly httpInvalidator: ActorHttpInvalidateListenable;
  private readonly mediatorHttp: MediatorHttp;

  // Context key to indicate that the actor has already wrapped the given request
  private static readonly keyWrapped = new ActionContextKey<boolean>('urn:comunica:actor-http-limit-rate#wrapped');

  public constructor(args: IActorHttpLimitRateArgs) {
    super(args);
    this.mediatorHttp = args.mediatorHttp;
    this.httpInvalidator = args.httpInvalidator;
    this.httpInvalidator.addInvalidateListener(action => this.handleHttpInvalidateEvent(action));
    this.correctionMultiplier = args.correctionMultiplier;
    this.failureMultiplier = args.failureMultiplier;
    this.limitByDefault = args.limitByDefault;
    this.allowOverlap = args.allowOverlap;
    this.hostData = new Map();
  }

  public async test(action: IActionHttp): Promise<TestResult<IMediatorTypeTime>> {
    if (action.context.has(ActorHttpLimitRate.keyWrapped)) {
      return failTest(`${this.name} can only wrap a request once`);
    }
    return passTest({ time: 0 });
  }

  public async run(action: IActionHttp): Promise<IActorHttpOutput> {
    const requestUrl = ActorHttp.getInputUrl(action.input);
    let requestHostData = this.hostData.get(requestUrl.host);

    if (!requestHostData) {
      requestHostData = {
        latestRequestTimestamp: 0,
        rateLimited: this.limitByDefault,
        requestInterval: Number.NEGATIVE_INFINITY,
      };
      this.hostData.set(requestUrl.host, requestHostData);
    }

    const currentTimestamp = Date.now();
    let currentRequestDelay = 0;

    if (requestHostData.rateLimited) {
      currentRequestDelay = Math.max(
        0,
        requestHostData.latestRequestTimestamp + requestHostData.requestInterval - currentTimestamp,
      );
    }

    // Update the latest request timestamp before waiting, so that further requests will be delayed correctly.
    // When overlap is disallowed, the timestamp is set to the expected despatch time of the current request,
    // which will help smooth out request bursts by spacing them out evently. With overlap allowed, however,
    // the timestamp is set to current time, which will result in overlapping requests and prevent smoothing.
    requestHostData.latestRequestTimestamp = currentTimestamp + (this.allowOverlap ? 0 : 1) * currentRequestDelay;

    if (currentRequestDelay > 0) {
      this.logDebug(action.context, 'Delaying request to match host response intervals', () => ({
        url: requestUrl.href,
        host: requestUrl.host,
        hostIntervalMilliseconds: requestHostData.requestInterval,
        requestDelayMilliseconds: currentRequestDelay,
      }));
      await new Promise(resolve => setTimeout(resolve, currentRequestDelay));
    }

    const registerCompletedRequest = (success: boolean): void => {
      const requestDuration = (success ? 1 : this.failureMultiplier) *
        (Date.now() - currentTimestamp - currentRequestDelay);
      if (!success && !requestHostData.rateLimited) {
        requestHostData.rateLimited = true;
      }
      if (requestHostData.requestInterval < 0) {
        requestHostData.requestInterval = requestDuration * this.correctionMultiplier;
      } else {
        requestHostData.requestInterval += Math.round(this.correctionMultiplier * (
          requestDuration - requestHostData.requestInterval
        ));
      }
    };

    try {
      const response = await this.mediatorHttp.mediate({
        ...action,
        context: action.context.set(ActorHttpLimitRate.keyWrapped, true),
      });
      registerCompletedRequest(response.ok);
      return response;
    } catch (error: unknown) {
      registerCompletedRequest(false);
      throw error;
    }
  }

  /**
   * Handles HTTP cache invalidation events.
   * @param {IActionHttpInvalidate} action The invalidation action
   */
  public handleHttpInvalidateEvent(action: IActionHttpInvalidate): void {
    if (action.url) {
      const invalidatedHost = new URL(action.url).host;
      this.hostData.delete(invalidatedHost);
    } else {
      this.hostData.clear();
    }
  }
}

interface IHostData {
  /**
   * The determined request interval for the host.
   */
  requestInterval: number;
  /**
   * The timestamp of the latest request to the host.
   */
  latestRequestTimestamp: number;
  /**
   * Whether the host is being rate limited.
   */
  rateLimited: boolean;
}

export interface IActorHttpLimitRateArgs extends IActorHttpArgs {
  /**
   * The HTTP mediator.
   */
  mediatorHttp: MediatorHttp;
  /* eslint-disable max-len */
  /**
   * An actor that listens to HTTP invalidation events
   * @default {<default_invalidator> a <npmd:@comunica/bus-http-invalidate/^4.0.0/components/ActorHttpInvalidateListenable.jsonld#ActorHttpInvalidateListenable>}
   */
  httpInvalidator: ActorHttpInvalidateListenable;
  /* eslint-enable max-len */
  /**
   * Multiplier for how aggressively the delay should follow the latest response time, ideally in range ]0.0, 1.0].
   * @range {float}
   * @default {0.1}
   */
  correctionMultiplier: number;
  /**
   * The response time of a failed request is taken into account with this multiplier applied.
   * @range {float}
   * @default {10.0}
   */
  failureMultiplier: number;
  /**
   * Whether rate limiting should be applied from the first request onwards, instead of waiting for a request to fail.
   * Enabling this behaviour can help avoid spamming a server with large amounts of requests when execution begins.
   * @range {boolean}
   * @default {false}
   */
  limitByDefault: boolean;
  /**
   * Whether requests should be allowed to overlap, instead of being effectively queued one after another for a host.
   * Enabling this behaviour may help with overall performance, but will make the rate limiter less accurate,
   * and make it impossible for the limiter to smooth out large bursts of requests to a given host.
   * @range {boolean}
   * @default {false}
   */
  allowOverlap: boolean;
}
