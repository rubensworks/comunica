import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { ActorInitQuery } from '@comunica/actor-init-query';
import { Bus } from '@comunica/core';
import type { IDataset } from '@comunica/types';
import { StreamParser } from 'n3';
import { DataFactory } from 'rdf-data-factory';
import { Factory } from 'sparqlalgebrajs';
import { ActorRdfMetadataExtractVoid } from '../lib/ActorRdfMetadataExtractVoid';
import '@comunica/utils-jest';
import {
  RDF_TYPE,
  VOID_CLASS,
  VOID_CLASS_PARTITION,
  VOID_CLASSES,
  VOID_DATASET,
  VOID_ENTITIES,
  VOID_PROPERTY,
  VOID_PROPERTY_PARTITION,
  VOID_TRIPLES,
  VOID_URI_REGEX_PATTERN,
  VOID_URI_SPACE,
} from '../lib/Definitions';

const streamifyArray = require('streamify-array');

jest.mock('@comunica/actor-init-query');
jest.mock('@comunica/bus-rdf-metadata-extract');

const DF = new DataFactory();
const AF = new Factory(DF);

describe('ActorRdfMetadataExtractVoid', () => {
  let bus: any;
  let actor: ActorRdfMetadataExtractVoid;
  let actorInitQuery: ActorInitQuery;

  beforeEach(() => {
    jest.resetAllMocks();
    bus = new Bus({ name: 'bus' });
    actorInitQuery = new ActorInitQuery(<any> {});
    actor = new ActorRdfMetadataExtractVoid({
      bus,
      name: 'actor',
      actorInitQuery,
    });
  });

  describe('test', () => {
    it('should test', async() => {
      await expect(actor.test(<any> {})).resolves.toBeTruthy();
    });
  });

  describe('run', () => {
    it('should handle empty metadata stream', async() => {
      const url = 'http://localhost:3000/sparql';
      const metadata = streamifyArray([]);
      await expect(actor.run(<any>{ metadata, url })).resolves.toEqual({ metadata: {}});
    });

    it('should ignore descriptions without triple count', async() => {
      const url = 'http://localhost:3000/sparql';
      const dataset = DF.namedNode(url);
      const metadata = streamifyArray([
        DF.quad(dataset, DF.namedNode(RDF_TYPE), DF.namedNode(VOID_DATASET)),
      ]);
      await expect(actor.run(<any>{ metadata, url })).resolves.toEqual({ metadata: {}});
    });

    it('should ignore descriptions without class or property partitions', async() => {
      const url = 'http://localhost:3000/sparql';
      const dataset = DF.namedNode(url);
      const metadata = streamifyArray([
        DF.quad(dataset, DF.namedNode(RDF_TYPE), DF.namedNode(VOID_DATASET)),
        DF.quad(dataset, DF.namedNode(VOID_TRIPLES), DF.literal('1234')),
      ]);
      await expect(actor.run(<any>{ metadata, url })).resolves.toEqual({ metadata: {}});
    });

    it('should handle descriptions with property partitions', async() => {
      const url = 'http://localhost:3000/sparql';
      const dataset = DF.namedNode(url);
      const propertyUri = DF.namedNode('ex:p');
      const propertyPartition = DF.blankNode();
      const propertyPartitionTriples = 5724;
      const metadata = streamifyArray([
        DF.quad(dataset, DF.namedNode(RDF_TYPE), DF.namedNode(VOID_DATASET)),
        DF.quad(dataset, DF.namedNode(VOID_TRIPLES), DF.literal('1234')),
        DF.quad(dataset, DF.namedNode(VOID_PROPERTY_PARTITION), propertyPartition),
        DF.quad(dataset, DF.namedNode(VOID_URI_SPACE), DF.literal('http://localhost:3000/')),
        DF.quad(dataset, DF.namedNode(VOID_URI_REGEX_PATTERN), DF.literal('^http://localhost:3000/.*')),
        DF.quad(propertyPartition, DF.namedNode(VOID_PROPERTY), propertyUri),
        DF.quad(propertyPartition, DF.namedNode(VOID_TRIPLES), DF.literal(propertyPartitionTriples.toString())),
      ]);
      const output = actor.run(<any>{ metadata, url });
      await expect(output).resolves.toEqual({ metadata: { datasets: [
        { getCardinality: expect.any(Function), source: url, uri: url },
      ]}});
      // Test the cardinality estimation part to make sure that function also works.
      const extractedDataset: IDataset = (await output).metadata.datasets[0];
      const pattern = AF.createPattern(DF.variable('s'), propertyUri, DF.variable('o'));
      await expect(extractedDataset.getCardinality(pattern)).resolves.toEqual({
        type: 'estimate',
        value: propertyPartitionTriples,
        dataset: url,
      });
    });

    it('should handle descriptions with class partitions', async() => {
      const url = 'http://localhost:3000/sparql';
      const dataset = DF.namedNode(url);
      const classUri = DF.namedNode('ex:C');
      const classPartition = DF.blankNode();
      const classPartitionEntities = 4321;
      const metadata = streamifyArray([
        DF.quad(dataset, DF.namedNode(RDF_TYPE), DF.namedNode(VOID_DATASET)),
        DF.quad(dataset, DF.namedNode(VOID_TRIPLES), DF.literal('1234')),
        DF.quad(dataset, DF.namedNode(VOID_CLASSES), DF.literal('4567')),
        DF.quad(dataset, DF.namedNode(VOID_CLASS_PARTITION), classPartition),
        DF.quad(dataset, DF.namedNode(VOID_URI_SPACE), DF.literal('http://localhost:3000/')),
        DF.quad(dataset, DF.namedNode(VOID_URI_REGEX_PATTERN), DF.literal('^http://localhost:3000/.*')),
        DF.quad(classPartition, DF.namedNode(VOID_ENTITIES), DF.literal(classPartitionEntities.toString())),
        DF.quad(classPartition, DF.namedNode(VOID_CLASS), classUri),
      ]);
      const output = actor.run(<any>{ metadata, url });
      await expect(output).resolves.toEqual({ metadata: { datasets: [
        { getCardinality: expect.any(Function), source: url, uri: url },
      ]}});
      // Test the cardinality estimation part to make sure that function also works.
      const extractedDataset: IDataset = (await output).metadata.datasets[0];
      const pattern = AF.createPattern(DF.variable('s'), DF.namedNode(RDF_TYPE), classUri);
      await expect(extractedDataset.getCardinality(pattern)).resolves.toEqual({
        type: 'estimate',
        value: classPartitionEntities,
        dataset: url,
      });
    });

    it('should handle Wikidata SPARQL Service Description', async() => {
      const url = 'http://query.wikidata.org/bigdata/namespace/wdq/sparql';
      const stream = createReadStream(join(__dirname, 'descriptions', 'wikidata.nt'));
      const parser = new StreamParser();
      const metadata = stream.pipe(parser);
      await expect(actor.run(<any>{ metadata, url })).resolves.toEqual({ metadata: { datasets: [
        { getCardinality: expect.any(Function), source: url, uri: 'b0_defaultGraph' },
      ]}});
    });

    it('should handle Rhea SPARQL Service Description', async() => {
      const url = 'https://sparql.rhea-db.org/sparql';
      const stream = createReadStream(join(__dirname, 'descriptions', 'rhea-db.nt'));
      const parser = new StreamParser();
      const metadata = stream.pipe(parser);
      await expect(actor.run(<any>{ metadata, url })).resolves.toEqual({ metadata: { datasets: [
        { getCardinality: expect.any(Function), source: url, uri: 'https://sparql.rhea-db.org/.well-known/void#_graph_chebi' },
        { getCardinality: expect.any(Function), source: url, uri: 'https://sparql.rhea-db.org/.well-known/void#_graph_rhea' },
        { getCardinality: expect.any(Function), source: url, uri: 'https://sparql.rhea-db.org/.well-known/void#_graph_void' },
        { getCardinality: expect.any(Function), source: url, uri: 'https://sparql.rhea-db.org/.well-known/void#_graph_sparql-examples' },
      ]}});
    });
  });
});
