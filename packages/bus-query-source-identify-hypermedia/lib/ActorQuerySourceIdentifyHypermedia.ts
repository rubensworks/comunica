import type { IAction, IActorArgs, IActorOutput, IActorTest, Mediate, TestResult } from '@comunica/core';
import { failTest, Actor } from '@comunica/core';
import type { IQuerySource } from '@comunica/types';
import type * as RDF from '@rdfjs/types';

/**
 * A comunica actor for query-source-identify-hypermedia events.
 *
 * Actor types:
 * * Input:  IActionQuerySourceIdentifyHypermedia:      The metadata in the document and a query operation.
 * * Test:   <none>
 * * Output: IActorQuerySourceIdentifyHypermediaOutput: A query source.
 *
 * @see IActionQuerySourceIdentifyHypermedia
 * @see IActorQuerySourceIdentifyHypermediaOutput
 */
export abstract class ActorQuerySourceIdentifyHypermedia<TS = undefined>
  extends Actor<
    IActionQuerySourceIdentifyHypermedia,
IActorQuerySourceIdentifyHypermediaTest,
IActorQuerySourceIdentifyHypermediaOutput,
TS
> {
  protected readonly sourceType: string;

  /* eslint-disable max-len */
  /**
   * @param args -
   *   \ @defaultNested {<default_bus> a <cc:components/Bus.jsonld#Bus>} bus
   *   \ @defaultNested {Query source hypermedia identification failed: none of the configured actors were able to identify ${action.url}} busFailMessage
   * @param sourceType The source type.
   */
  /* eslint-enable max-len */
  public constructor(args: IActorQuerySourceIdentifyHypermediaArgs<TS>, sourceType: string) {
    super(args);
    this.sourceType = sourceType;
  }

  public async test(
    action: IActionQuerySourceIdentifyHypermedia,
  ): Promise<TestResult<IActorQuerySourceIdentifyHypermediaTest, TS>> {
    if (action.forceSourceType && this.sourceType !== action.forceSourceType) {
      return failTest(`Actor ${this.name} is not able to handle source type ${action.forceSourceType}.`);
    }
    return this.testMetadata(action);
  }

  public abstract testMetadata(
    action: IActionQuerySourceIdentifyHypermedia,
  ): Promise<TestResult<IActorQuerySourceIdentifyHypermediaTest, TS>>;
}

export interface IActionQuerySourceIdentifyHypermedia extends IAction {
  /**
   * The URL of the source that was fetched.
   */
  url: string;
  /**
   * A metadata key-value mapping.
   */
  metadata: Record<string, any>;
  /**
   * A stream of data quads.
   */
  quads: RDF.Stream;
  /**
   * A hash of all datasets that have been handled.
   */
  handledDatasets?: Record<string, boolean>;
  /**
   * The explicitly requested source type.
   * If set, the source type of the actor MUST explicitly match the given forced type.
   */
  forceSourceType?: string;
}

export interface IActorQuerySourceIdentifyHypermediaTest extends IActorTest {
  /**
   * A value from 0 to 1 indicating to what respect a source type is
   * able to pre-filter the source based on the pattern.
   * 1 indicates that the source can apply the whole pattern,
   * and 0 indicates that the source can not apply the pattern at all (and local filtering must happen).
   */
  filterFactor: number;
}

export interface IActorQuerySourceIdentifyHypermediaOutput extends IActorOutput {
  /**
   * The new source of quads contained in the document.
   */
  source: IQuerySource;
  /**
   * The dataset that was handled.
   */
  dataset?: string;
}

export type IActorQuerySourceIdentifyHypermediaArgs<TS = undefined> = IActorArgs<
IActionQuerySourceIdentifyHypermedia,
IActorQuerySourceIdentifyHypermediaTest,
IActorQuerySourceIdentifyHypermediaOutput,
TS
>;

export type MediatorQuerySourceIdentifyHypermedia = Mediate<
IActionQuerySourceIdentifyHypermedia,
IActorQuerySourceIdentifyHypermediaOutput,
IActorQuerySourceIdentifyHypermediaTest
>;
