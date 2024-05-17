import type {
  IActionSparqlSerialize,
  IActorQueryResultSerializeFixedMediaTypesArgs,
  IActorQueryResultSerializeOutput,
} from '@comunica/bus-query-result-serialize';
import { ActorQueryResultSerializeFixedMediaTypes } from '@comunica/bus-query-result-serialize';
import type {
  IActionContext,
  IQueryOperationResultBindings,
  IQueryOperationResultBoolean,
} from '@comunica/types';
import type * as RDF from '@rdfjs/types';
import { Readable } from 'readable-stream';
import { XmlSerializer, type IXmlNode } from './XmlSerializer';

/**
 * A comunica sparql-results+xml Serialize Actor.
 */
export class ActorQueryResultSerializeSparqlXml extends ActorQueryResultSerializeFixedMediaTypes {
  /**
   * @param args -
   *   \ @defaultNested {{
   *       "application/sparql-results+xml": 0.8
   *     }} mediaTypePriorities
   *   \ @defaultNested {{
   *       "application/sparql-results+xml": "http://www.w3.org/ns/formats/SPARQL_Results_XML"
   *     }} mediaTypeFormats
   */
  public constructor(args: IActorQueryResultSerializeFixedMediaTypesArgs) {
    super(args);
  }

  /**
   * Converts an RDF term to its object-based XML representation.
   * @param {RDF.Term} value An RDF term.
   * @param {string} key A variable name, '?' must be included as a prefix.
   * @return {IXmlNode} An object-based XML tag.
   */
  public static bindingToXmlBindings(value: RDF.Term, key: RDF.Variable): IXmlNode {
    return { name: 'binding', attributes: { name: key.value }, children: [ this.valueToXmlValue(value) ]};
  }

  public static valueToXmlValue(value: RDF.Term): IXmlNode {
    let attributes;
    switch (value.termType) {
      case 'Literal':
        if (value.language) {
          attributes = { 'xml:lang': value.language };
        } else if (value.datatype && value.datatype.value !== 'http://www.w3.org/2001/XMLSchema#string') {
          attributes = { datatype: value.datatype.value };
        } else {
          attributes = {};
        }
        return { name: 'literal', attributes, children: value.value };
      case 'BlankNode':
        return { name: 'bnode', children: value.value };
      case 'Quad':
        return {
          name: 'triple',
          children: [
            { name: 'subject', children: [ this.valueToXmlValue(value.subject) ]},
            { name: 'predicate', children: [ this.valueToXmlValue(value.predicate) ]},
            { name: 'object', children: [ this.valueToXmlValue(value.object) ]},
          ],
        };
      default:
        return { name: 'uri', children: value.value };
    }
  }

  public override async testHandleChecked(action: IActionSparqlSerialize, _context: IActionContext): Promise<boolean> {
    if (![ 'bindings', 'boolean' ].includes(action.type)) {
      throw new Error('This actor can only handle bindings streams or booleans.');
    }
    return true;
  }

  public async runHandle(action: IActionSparqlSerialize, _mediaType: string, _context: IActionContext):
  Promise<IActorQueryResultSerializeOutput> {
    const data = new Readable();
    data._read = () => {
      // Do nothing
    };

    let size = 0;
    // Write head
    const serializer = new XmlSerializer((chunk) => {
      size--;
      data.push(chunk);
    });
    serializer.open('sparql', { xmlns: 'http://www.w3.org/2005/sparql-results#' });
    const metadata = await (<IQueryOperationResultBindings> action).metadata();
    serializer.add({
      name: 'head',
      children: metadata.variables.map(variable => ({ name: 'variable', attributes: { name: variable.value }})),
    });
    if (action.type === 'bindings') {
      serializer.open('results');
      const resultStream = (<IQueryOperationResultBindings> action).bindingsStream;

      // Write bindings
      resultStream.on('error', (error: Error) => {
        data.emit('error', error);
      });

      data._read = (isize) => {
        size = Math.max(size, isize);
        // eslint-disable-next-line no-unmodified-loop-condition
        while (size > 0) {
          const result = resultStream.read();
          if (result === null) {
            resultStream.once('readable', () => data._read(0));
            return;
          }
          serializer.add({ name: 'result', children: [ ...result ]
            .map(([ key, value ]) => ActorQueryResultSerializeSparqlXml.bindingToXmlBindings(value, key)) });
        }
      };

      // Close streams
      resultStream.on('end', () => {
        serializer.close();
        serializer.close();
        setTimeout(() => data.push(null));
      });
    } else {
      try {
        const result = await (<IQueryOperationResultBoolean> action).execute();
        serializer.add({ name: 'boolean', children: result.toString() });
        serializer.close();
        setTimeout(() => data.push(null));
      } catch (error: unknown) {
        setTimeout(() => data.emit('error', error));
      }
    }

    return { data };
  }
}
