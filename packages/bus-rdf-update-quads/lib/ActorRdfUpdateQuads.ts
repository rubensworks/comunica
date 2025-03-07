import type { IAction, IActorArgs, IActorOutput, IActorTest, Mediate } from '@comunica/core';
import { Actor } from '@comunica/core';
import type * as RDF from '@rdfjs/types';
import type { AsyncIterator } from 'asynciterator';

/**
 * A comunica actor for rdf-update-quads events.
 *
 * Actor types:
 * * Input:  IActionRdfUpdateQuads:      Quad insertion and deletion streams.
 * * Test:   <none>
 * * Output: IActorRdfUpdateQuadsOutput: A promise resolving when the update operation is done.
 *
 * @see IActionRdfUpdateQuads
 * @see IActorRdfUpdateQuadsOutput
 */
export abstract class ActorRdfUpdateQuads<TS = undefined>
  extends Actor<IActionRdfUpdateQuads, IActorTest, IActorRdfUpdateQuadsOutput, TS> {
  /* eslint-disable max-len */
  /**
   * @param args -
   *   \ @defaultNested {<default_bus> a <cc:components/Bus.jsonld#Bus>} bus
   *   \ @defaultNested {RDF updating failed: none of the configured actors were able to handle an update} busFailMessage
   */
  /* eslint-enable max-len */
  public constructor(args: IActorRdfUpdateQuadsArgs<TS>) {
    super(args);
  }
}

export interface IActionRdfUpdateQuads extends IAction {
  /**
   * An optional stream of quads to insert.
   */
  quadStreamInsert?: AsyncIterator<RDF.Quad>;
  /**
   * An optional stream of quads to delete.
   */
  quadStreamDelete?: AsyncIterator<RDF.Quad>;
  /**
   * An optional deletion of graphs.
   */
  deleteGraphs?: {
    /**
     * The graph(s) in which all triples must be removed.
     */
    graphs: RDF.DefaultGraph | 'NAMED' | 'ALL' | RDF.NamedNode[];
    /**
     * If true, and the graph does not exist, an error must be emitted.
     *
     * Should only be considered on destinations that record empty graphs.
     */
    requireExistence: boolean;
    /**
     * If the graph itself should also be dropped.
     * Should not happen on the 'DEFAULT' graph.
     *
     * Should only be considered on destinations that record empty graphs.
     */
    dropGraphs: boolean;
  };
  /**
   * An optional creation of (empty) graphs.
   */
  createGraphs?: {
    /**
     * The graph names to create.
     */
    graphs: RDF.NamedNode[];
    /**
     * If true, an error MUST be thrown when the graph already exists.
     *
     * For destinations that do not record empty graphs,
     * this should only throw if at least one quad with the given quad already exists.
     */
    requireNonExistence: boolean;
  };
}

export interface IActorRdfUpdateQuadsOutput extends IActorOutput {
  /**
   * Async function that resolves when the update operation is done.
   */
  execute: () => Promise<void>;
}

export type IActorRdfUpdateQuadsArgs<TS = undefined> =
  IActorArgs<IActionRdfUpdateQuads, IActorTest, IActorRdfUpdateQuadsOutput, TS>;

export type MediatorRdfUpdateQuads = Mediate<IActionRdfUpdateQuads, IActorRdfUpdateQuadsOutput>;
