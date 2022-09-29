import type { IActionHttp, IActorHttpOutput, IActorHttpArgs } from '@comunica/bus-http';
import { ActorHttp } from '@comunica/bus-http';
import { KeysHttp } from '@comunica/context-entries';
import type { IMediatorTypeTime } from '@comunica/mediatortype-time';
import type { Readable } from 'readable-stream';
import 'cross-fetch/polyfill';
import { FetchInitPreprocessor } from './FetchInitPreprocessor';
import type { IFetchInitPreprocessor } from './IFetchInitPreprocessor';

/**
 * A node-fetch actor that listens on the 'init' bus.
 *
 * It will call `fetch` with either action.input or action.url.
 */
export class ActorHttpFetch extends ActorHttp {
  private readonly userAgent: string;
  private readonly fetchInitPreprocessor: IFetchInitPreprocessor;

  public constructor(args: IActorHttpFetchArgs) {
    super(args);
    this.userAgent = ActorHttpFetch.createUserAgent();
    this.fetchInitPreprocessor = new FetchInitPreprocessor(args.agentOptions);
  }

  public static createUserAgent(): string {
    return `Comunica/actor-http-fetch (${typeof global.navigator === 'undefined' ?
      `Node.js ${process.version}; ${process.platform}` :
      `Browser-${global.navigator.userAgent}`})`;
  }

  public async test(action: IActionHttp): Promise<IMediatorTypeTime> {
    return { time: Number.POSITIVE_INFINITY };
  }

  public async run(action: IActionHttp): Promise<IActorHttpOutput> {
    // Prepare headers
    const initHeaders = action.init?.headers ?? {};
    action.init = action.init ?? {};
    action.init.headers = new Headers(initHeaders);
    if (!action.init.headers.has('user-agent')) {
      action.init.headers.append('user-agent', this.userAgent);
    }
    const authString: string | undefined = action.context.get(KeysHttp.auth);
    if (authString) {
      action.init.headers.append('Authorization', `Basic ${Buffer.from(authString).toString('base64')}`);
    }

    // Log request
    this.logInfo(action.context, `Requesting ${typeof action.input === 'string' ?
      action.input :
      action.input.url}`, () => ({
      headers: ActorHttp.headersToHash(new Headers(action.init!.headers)),
      method: action.init!.method || 'GET',
    }));

    // TODO: remove this workaround once this has a fix: https://github.com/inrupt/solid-client-authn-js/issues/1708
    if (action.init?.headers && 'append' in action.init.headers && action.context.has(KeysHttp.fetch)) {
      action.init.headers = ActorHttp.headersToHash(action.init.headers);
    }

    let requestInit = { ...action.init };

    if (action.context.get(KeysHttp.includeCredentials)) {
      requestInit.credentials = 'include';
    }

    const httpTimeout: number | undefined = action.context?.get(KeysHttp.httpTimeout);
    let requestTimeout: NodeJS.Timeout | undefined;
    let onTimeout: (() => void) | undefined;
    if (httpTimeout !== undefined) {
      const controller = await this.fetchInitPreprocessor.createAbortController();
      requestInit.signal = controller.signal;
      onTimeout = () => controller.abort();
      requestTimeout = setTimeout(() => onTimeout!(), httpTimeout);
    }

    try {
      requestInit = await this.fetchInitPreprocessor.handle(requestInit);
      let retryCount: number = action.context?.get(KeysHttp.httpRetryCount) ?? 0;

      const customFetch: ((input: RequestInfo, init?: RequestInit) => Promise<Response>) | undefined = action
        .context?.get(KeysHttp.fetch);

      // Actual fetch respecting timeout and retry count.
      const getResponse = async(): Promise<Response> => {
        let lastError: unknown;
        const retriesAllowed = retryCount > 0;

        // When retry count is greater than 0, repeat fetch.
        while (retryCount-- >= 0) {
          try {
            return await (customFetch || fetch)(action.input, requestInit);
          } catch (error: unknown) {
            lastError = error;
            // If the fetch was aborted by timeout, we won't retry.
            if (requestInit.signal?.aborted) {
              throw error;
            }

            if (retryCount >= 0) {
              // Wait for specified delay, before retrying.
              await new Promise((resolve, reject) => {
                setTimeout(resolve, action.context?.get(KeysHttp.httpRetryDelay) ?? 0);
                // Cancel waiting, if timeout is reached.
                requestInit.signal?.addEventListener('abort', () => {
                  reject(new Error('Fetch aborted by timeout.'));
                });
              });
            }
          }
        }
        // The fetch was not successful. We through.
        if (retriesAllowed) {
          // Feedback the last error, if there were retry attempts.
          throw new Error(`Number of fetch retries exceeded. Last error: ${String(lastError)}`);
        } else {
          throw lastError;
        }
      };

      // Execute the fetch (with retries and timeouts, if applicable).
      const response = await getResponse();

      // We remove or update the timeout
      if (requestTimeout !== undefined) {
        const httpBodyTimeout = action.context?.get(KeysHttp.httpBodyTimeout) || false;
        if (httpBodyTimeout && response.body) {
          onTimeout = () => response.body?.cancel(new Error(`HTTP timeout when reading the body of ${response.url}.
This error can be disabled by modifying the 'httpBodyTimeout' and/or 'httpTimeout' options.`));
          (<Readable><any>response.body).on('close', () => {
            clearTimeout(requestTimeout);
          });
        } else {
          clearTimeout(requestTimeout);
        }
      }

      // Node-fetch does not support body.cancel, while it is mandatory according to the fetch and readablestream api.
      // If it doesn't exist, we monkey-patch it.
      if (response.body && !response.body.cancel) {
        response.body.cancel = async(error?: Error) => {
          (<Readable><any>response.body).destroy(error);
          if (requestTimeout !== undefined) {
            // We make sure to remove the timeout if it is still enabled
            clearTimeout(requestTimeout);
          }
        };
      }

      return response;
    } catch (error: unknown) {
      if (requestTimeout !== undefined) {
        clearTimeout(requestTimeout);
      }
      throw error;
    }
  }
}

export interface IActorHttpFetchArgs extends IActorHttpArgs {
  /**
   * The agent options for the HTTP agent
   * @range {json}
   * @default {{ "keepAlive": true, "maxSockets": 5 }}
   */
  agentOptions?: Record<string, any>;
}
