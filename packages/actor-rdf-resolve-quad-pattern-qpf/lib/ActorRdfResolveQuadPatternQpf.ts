import {ISearchForm, ISearchForms} from "@comunica/actor-rdf-metadata-extract-hydra-controls";
import {IActionRdfDereferencePaged, IActorRdfDereferencePagedOutput} from "@comunica/bus-rdf-dereference-paged";
import {ActorRdfResolveQuadPatternSource, IActionRdfResolveQuadPattern,
  IActorRdfResolveQuadPatternOutput, ILazyQuadSource} from "@comunica/bus-rdf-resolve-quad-pattern";
import {Actor, IActorArgs, IActorTest, Mediator} from "@comunica/core";
import * as RDF from "rdf-js";
import {MediatedQuadSource} from "./MediatedQuadSource";

/**
 * A comunica QPF RDF Resolve Quad Pattern Actor.
 */
export class ActorRdfResolveQuadPatternQpf extends ActorRdfResolveQuadPatternSource
   implements IActorRdfResolveQuadPatternQpfArgs {

  public readonly mediatorRdfDereferencePaged: Mediator<Actor<IActionRdfDereferencePaged, IActorTest,
    IActorRdfDereferencePagedOutput>, IActionRdfDereferencePaged, IActorTest, IActorRdfDereferencePagedOutput>;
  public readonly subjectUri: string;
  public readonly predicateUri: string;
  public readonly objectUri: string;
  public readonly graphUri?: string;
  protected sources: {[entrypoint: string]: RDF.Source} = {};

  constructor(args: IActorRdfResolveQuadPatternQpfArgs) {
    super(args);
    if (!this.mediatorRdfDereferencePaged) {
      throw new Error('A valid "mediatorRdfDereferencePaged" argument must be provided.');
    }
    if (!this.subjectUri) {
      throw new Error('A valid "subjectUri" argument must be provided.');
    }
    if (!this.predicateUri) {
      throw new Error('A valid "predicateUri" argument must be provided.');
    }
    if (!this.objectUri) {
      throw new Error('A valid "objectUri" argument must be provided.');
    }
  }

  public async test(action: IActionRdfResolveQuadPattern): Promise<IActorTest> {
    if (!action.context || !action.context.entrypoint) {
      throw new Error('Actor ' + this.name + ' can only resolve quad pattern queries against a QPF entrypoint.');
    }
    return true;
  }

  protected async createSource(context?: {[id: string]: any}): Promise<ILazyQuadSource> {
    // Collect metadata of the entrypoint
    const entrypoint: string = context.entrypoint;
    const metadata: {[id: string]: any} = (await this.mediatorRdfDereferencePaged.mediate({ url: entrypoint }))
      .firstPageMetadata;
    if (!metadata) {
      throw new Error('No metadata was found at entrypoint ' + entrypoint);
    }

    // Find a quad pattern or triple pattern search form
    const searchForms: ISearchForms = metadata.searchForms;
    if (!searchForms || !searchForms.values.length) {
      throw new Error('No Hydra search forms were discovered in the metadata of ' + entrypoint
        + '. You may be missing an actor that extracts this metadata');
    }

    // TODO: in the future, a query-based search form getter should be used.
    let chosenForm: ISearchForm = null;
    for (const searchForm of searchForms.values) {
      if (this.graphUri
        && this.subjectUri in searchForm.mappings
        && this.predicateUri in searchForm.mappings
        && this.objectUri in searchForm.mappings
        && this.graphUri in searchForm.mappings
        && Object.keys(searchForm.mappings).length === 4) {
        chosenForm = searchForm;
        break;
      }
      if (this.subjectUri in searchForm.mappings
        && this.predicateUri in searchForm.mappings
        && this.objectUri in searchForm.mappings
        && Object.keys(searchForm.mappings).length === 3) {
        chosenForm = searchForm;
        break;
      }
    }
    if (!chosenForm) {
      throw new Error('No valid Hydra search form was found for quad pattern or triple pattern queries.');
    }

    // Create a quad pattern to URL converter
    const uriConstructor = (subject?: RDF.Term, predicate?: RDF.Term, object?: RDF.Term, graph?: RDF.Term) => {
      const entries: {[id: string]: string} = {};
      if (subject.termType !== 'Variable') {
        entries[this.subjectUri] = subject.value;
      }
      if (predicate.termType !== 'Variable') {
        entries[this.predicateUri] = predicate.value;
      }
      if (object.termType !== 'Variable') {
        entries[this.objectUri] = object.value;
      }
      if (this.graphUri && graph.termType !== 'Variable') {
        entries[this.graphUri] = graph.value;
      }
      return chosenForm.getUri(entries);
    };

    return new MediatedQuadSource(this.mediatorRdfDereferencePaged, uriConstructor);
  }

  protected async getSource(context?: {[id: string]: any}): Promise<ILazyQuadSource> {
    // Cache the source object for each entrypoint
    const entrypoint: string = context.entrypoint;
    if (this.sources[entrypoint]) {
      return this.sources[entrypoint];
    }

    // Cache and return
    return this.sources[entrypoint] = await this.createSource(context);
  }

  protected getOutput(source: RDF.Source, pattern: RDF.Quad, context?: {[id: string]: any})
  : Promise<IActorRdfResolveQuadPatternOutput> {
    // Attach metadata to the output
    return super.getOutput(source, pattern, context)
      .then((output: IActorRdfResolveQuadPatternOutput) => {
        return new Promise<IActorRdfResolveQuadPatternOutput>((resolve, reject) => {
          output.data.on('error', reject);
          output.data.on('end', () => reject(new Error('No metadata was found')));
          output.data.on('metadata', (metadata) => {
            output.metadata = metadata;
            resolve(output);
          });
        });
      });
  }

}

export interface IActorRdfResolveQuadPatternQpfArgs extends
  IActorArgs<IActionRdfResolveQuadPattern, IActorTest, IActorRdfResolveQuadPatternOutput> {
  mediatorRdfDereferencePaged: Mediator<Actor<IActionRdfDereferencePaged, IActorTest, IActorRdfDereferencePagedOutput>,
    IActionRdfDereferencePaged, IActorTest, IActorRdfDereferencePagedOutput>;
  subjectUri: string;
  predicateUri: string;
  objectUri: string;
  graphUri?: string;
}
