import type { IActionHttp, IActorHttpOutput, IActorHttpArgs, MediatorHttp } from '@comunica/bus-http';
import { ActorHttp } from '@comunica/bus-http';
import type { ActorHttpInvalidateListenable, IActionHttpInvalidate } from '@comunica/bus-http-invalidate';
import type { TestResult } from '@comunica/core';
import { ActionContextKey, failTest, passTest } from '@comunica/core';
import type { IMediatorTypeTime } from '@comunica/mediatortype-time';

export class ActorHttpLimitRate extends ActorHttp {
  private readonly historyLength: number;
  private readonly failureMultiplier: number;
  private readonly hostData: Record<string, IHostRequestData>;
  private readonly httpInvalidator: ActorHttpInvalidateListenable;
  private readonly mediatorHttp: MediatorHttp;

  // Context key to indicate that the actor has already wrapped the given request
  private static readonly keyWrapped = new ActionContextKey<boolean>('urn:comunica:actor-http-limit-rate#wrapped');

  public constructor(args: IActorHttpLimitConcurrentArgs) {
    super(args);
    this.mediatorHttp = args.mediatorHttp;
    this.httpInvalidator = args.httpInvalidator;
    this.httpInvalidator.addInvalidateListener(action => this.handleHttpInvalidateEvent(action));
    this.historyLength = args.historyLength;
    this.failureMultiplier = args.failureMultiplier;
    this.hostData = {};
  }

  public async test(action: IActionHttp): Promise<TestResult<IMediatorTypeTime>> {
    if (action.context.has(ActorHttpLimitRate.keyWrapped)) {
      return failTest(`${this.name} can only wrap a request once`);
    }
    return passTest({ time: 0 });
  }

  public async run(action: IActionHttp): Promise<IActorHttpOutput> {
    const host = ActorHttp.getInputUrl(action.input).host;

    // Wait for the next free request slot on the host
    await this.waitForSlot(host);

    // Delay the request when relevant
    await this.delayRequest(host);

    const timeStart = Date.now();

    this.hostData[host].latestRequestTimestamp = timeStart;

    const response = await this.mediatorHttp.mediate({
      ...action,
      context: action.context.set(ActorHttpLimitRate.keyWrapped, true),
    });

    let duration = Date.now() - timeStart;

    if (response.ok) {
      if (
        this.hostData[host].openRequests >= this.hostData[host].concurrentRequestLimit &&
        this.hostData[host].requestQueue.length > 10 * this.hostData[host].concurrentRequestLimit
      ) {
        this.hostData[host].concurrentRequestLimit++;
      }
    } else {
      duration *= this.failureMultiplier;
      // Reduce the concurrent request limit to half, but round it up to make sure it stays at a minimum of 1
      this.hostData[host].concurrentRequestLimit = Math.ceil(this.hostData[host].concurrentRequestLimit / 2);
    }

    this.hostData[host].requestDurations.push(duration);

    if (this.hostData[host].requestDurations.length > this.historyLength) {
      this.hostData[host].requestDurations.shift();
    }

    this.hostData[host].openRequests--;

    this.enqueueNext(host);

    return response;
  }

  /**
   * Enqueue the following requests for the host.
   * @param {string} host The hostname.
   */
  public enqueueNext(host: string): void {
    while (this.hostData[host].openRequests < this.hostData[host].concurrentRequestLimit) {
      const next = this.hostData[host].requestQueue.shift();
      if (next) {
        next.send();
      } else {
        break;
      }
    }
  }

  /**
   * Waits for a free request slot for the specified host,
   * and resolves when one becomes available.
   * @param {string} host The host for which the request is to be sent.
   */
  public async waitForSlot(host: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const send = (): void => {
        // Immediately reserve the free slot by incrementing the 'active requests' counter.
        this.hostData[host].openRequests++;
        resolve();
      };

      if (typeof this.hostData[host] === 'undefined') {
        this.hostData[host] = {
          openRequests: 0,
          concurrentRequestLimit: 1,
          latestRequestTimestamp: 0,
          requestDurations: [],
          requestQueue: [],
        };
      }

      // When there are free slots, send the request immediately, otherwise add to queue
      if (this.hostData[host].openRequests < this.hostData[host].concurrentRequestLimit) {
        send();
      } else {
        this.hostData[host].requestQueue.push({ send, cancel: reject });
      }
    });
  }

  /**
   * Delay a request to the specified host by the amount of time calculated based on previous requests.
   * @param {string} host The host for which the request is being made.
   */
  public async delayRequest(host: string): Promise<void> {
    // If the request is not the first one, wait for the calculated amount of time.
    if (this.hostData[host].requestDurations.length > 0) {
      const requestInterval = (
        this.hostData[host].requestDurations.reduce((a, b) => a + b) /
        this.hostData[host].requestDurations.length
      );

      // Delay is calculated from when the latest request was sent to the same host
      const requestDelay = this.hostData[host].latestRequestTimestamp + requestInterval - Date.now();

      if (requestDelay > 1) {
        await new Promise(resolve => setTimeout(resolve, requestDelay));
      }
    }
  }

  /**
   * Handles HTTP cache invalidation events.
   * @param {IActionHttpInvalidate} action The invalidation action
   */
  public handleHttpInvalidateEvent(action: IActionHttpInvalidate): void {
    const invalidatedHost = action.url ? new URL(action.url).host : undefined;
    for (const host of Object.keys(this.hostData)) {
      if (!invalidatedHost || host === invalidatedHost) {
        for (const entry of this.hostData[host].requestQueue) {
          entry.cancel();
        }
        delete this.hostData[host];
      }
    }
  }
}

interface IHostRequestData {
  /**
   * The number of currently open requests to the host.
   */
  openRequests: number;
  /**
   * The timestamp of when the latest request was sent to the host.
   */
  latestRequestTimestamp: number;
  /**
   * Server response times for a number of previous requests.
   * The size of this tracker array is determined by the history length parameter.
   */
  requestDurations: number[];
  /**
   * The estimated concurrent request limit for the host.
   */
  concurrentRequestLimit: number;
  /**
   * Queue containing all the pending requests that could not be immediately sent.
   */
  requestQueue: { send: () => void; cancel: () => void }[];
};

export interface IActorHttpLimitConcurrentArgs extends IActorHttpArgs {
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
   * The number of past requests to consider for the delay average.
   * @default {10}
   */
  historyLength: number;
  /**
   * The impact of a failed request is taken into account with this multiplier applied.
   * @default {10}
   */
  failureMultiplier: number;
}
