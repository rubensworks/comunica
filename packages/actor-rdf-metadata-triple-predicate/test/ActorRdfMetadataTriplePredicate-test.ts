import {ActorRdfMetadata} from "@comunica/bus-rdf-metadata";
import {Bus} from "@comunica/core";
import * as RDF from "rdf-js";
import {Readable} from "stream";
import {ActorRdfMetadataTriplePredicate} from "../lib/ActorRdfMetadataTriplePredicate";

describe('ActorRdfMetadataTriplePredicate', () => {
  let bus;

  beforeEach(() => {
    bus = new Bus({ name: 'bus' });
  });

  describe('The ActorRdfMetadataTriplePredicate module', () => {
    it('should be a function', () => {
      expect(ActorRdfMetadataTriplePredicate).toBeInstanceOf(Function);
    });

    it('should be a ActorRdfMetadataTriplePredicate constructor', () => {
      expect(new (<any> ActorRdfMetadataTriplePredicate)({ name: 'actor', bus, predicateRegexes: [] }))
        .toBeInstanceOf(ActorRdfMetadataTriplePredicate);
      expect(new (<any> ActorRdfMetadataTriplePredicate)({ name: 'actor', bus, predicateRegexes: [] }))
        .toBeInstanceOf(ActorRdfMetadata);
    });

    it('should not be able to create new ActorRdfMetadataTriplePredicate objects without \'new\'', () => {
      expect(() => { (<any> ActorRdfMetadataTriplePredicate)(); }).toThrow();
    });
  });

  describe('An ActorRdfMetadataTriplePredicate instance', () => {
    let actor: ActorRdfMetadataTriplePredicate;
    let input: Readable;

    beforeEach(() => {
      actor = new ActorRdfMetadataTriplePredicate({ bus, name: 'actor', predicateRegexes: [
        '^px.*',
        '.*py$',
      ] });
      input = stream([
        quad('s1', 'p1', 'o1', ''),
        quad('g1', '_py', 'o1', ''),
        quad('s2', 'px__', 'o2', ''),
        quad('s3', 'p3', 'o3', ''),
      ]);
    });

    it('should not test on a triple stream', () => {
      return expect(actor.test({ pageUrl: '', quads: input, triples: true })).resolves.toBeTruthy();
    });

    it('should test on a quad stream', () => {
      return expect(actor.test({ pageUrl: '', quads: input })).resolves.toBeTruthy();
    });

    it('should run', () => {
      return actor.run({ pageUrl: 's3', quads: input })
        .then((output) => {
          return new Promise((resolve, reject) => {
            const data: RDF.Quad[] = [];
            const metadata: RDF.Quad[] = [];
            let ended = 0;

            output.data.on('data', (d) => data.push(d));
            output.metadata.on('data', (d) => metadata.push(d));
            output.data.on('end', onEnd);
            output.metadata.on('end', onEnd);

            function onEnd() {
              if (++ended === 2) {
                expect(data).toEqual([
                  quad('s1', 'p1', 'o1', ''),
                ]);
                expect(metadata).toEqual([
                  quad('g1', '_py', 'o1', ''),
                  quad('s2', 'px__', 'o2', ''),
                  quad('s3', 'p3', 'o3', ''),
                ]);
                if (data.length === 1 && metadata.length === 3) {
                  resolve();
                } else {
                  reject();
                }
              }
            }
          });
        });
    });
  });
});

function stream(quads) {
  const readable = new Readable({ objectMode: true });
  readable._read = () => {
    readable.push(quads.shift());
    if (quads.length === 0) {
      readable.push(null);
    }
  };
  return readable;
}

function quad(s, p, o, g) {
  return {
    graph:     { value: g },
    object:    { value: o },
    predicate: { value: p },
    subject:   { value: s },
  };
}
