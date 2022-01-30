import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import type { IActorRdfDereferenceOutput } from '@comunica/bus-rdf-dereference';
import { ActorRdfDereference } from '@comunica/bus-rdf-dereference';
import type { IActorRdfParseOutput } from '@comunica/bus-rdf-parse';
import { KeysInitQuery } from '@comunica/context-entries';
import { ActionContext, Bus } from '@comunica/core';
import type { IActionContext } from '@comunica/types';
import { ActorRdfDereferenceFile } from '../lib/ActorRdfDereferenceFile';

const arrayifyStream = require('arrayify-stream');

function fileUrl(str: string): string {
  let pathName = path.resolve(str).replace(/\\/ug, '/');

  // Windows drive letter must be prefixed with a slash
  if (!pathName.startsWith('/')) {
    pathName = `/${pathName}`;
  }

  return encodeURI(`file://${pathName}`);
}

describe('ActorRdfDereferenceFile', () => {
  let bus: any;
  let context: IActionContext;

  beforeEach(() => {
    bus = new Bus({ name: 'bus' });
    context = new ActionContext();
  });

  describe('The ActorRdfDereferenceFile module', () => {
    it('should be a function', () => {
      expect(ActorRdfDereferenceFile).toBeInstanceOf(Function);
    });

    it('should be a ActorRdfDereferenceFile constructor', () => {
      expect(new (<any> ActorRdfDereferenceFile)({ name: 'actor', bus })).toBeInstanceOf(ActorRdfDereferenceFile);
      expect(new (<any> ActorRdfDereferenceFile)({ name: 'actor', bus })).toBeInstanceOf(ActorRdfDereference);
    });

    it('should not be able to create new ActorRdfDereferenceFile objects without \'new\'', () => {
      expect(() => { (<any> ActorRdfDereferenceFile)(); }).toThrow();
    });
  });

  describe('An ActorRdfDereferenceFile instance', () => {
    let actor: ActorRdfDereferenceFile;
    let mediatorRdfParse: any;
    let mediaMappings: any;

    beforeEach(() => {
      mediatorRdfParse = {
        async mediate(action: any): Promise<{ handle: IActorRdfParseOutput }> {
          const quads = new Readable();
          if (action.context && action.context.hasRaw('emitParseError')) {
            quads._read = () => {
              quads.emit('error', new Error('Parse error'));
            };
            return { handle: { data: quads, metadata: { triples: true }}};
          } if (action.context && action.context.hasRaw('parseReject')) {
            return Promise.reject(new Error('Parse reject error'));
          }
          const data = await arrayifyStream(action.handle.data);
          return {
            handle: {
              data: {
                // @ts-expect-error
                data: data[0],
                mediaType: action.handleMediaType,
              },
              metadata: { triples: false },
            },
          };
        },
      };
      mediaMappings = { ttl: 'text/turtle' };
      actor = new ActorRdfDereferenceFile({ name: 'actor', bus, mediaMappings, mediatorRdfParse });
    });

    it('should test', () => {
      return expect(actor.test({ url: fileUrl(path.join(__dirname, 'dummy.ttl')), context })).resolves.toEqual(true);
    });

    it('should test non-file URIs', () => {
      return expect(actor.test({ url: path.join(__dirname, 'dummy.ttl'), context })).resolves.toBeTruthy();
    });

    it('should not test for non-existing files', () => {
      return expect(actor.test({ url: 'fake.ttl', context })).rejects.toBeTruthy();
    });

    it('should run', () => {
      const p = path.join(__dirname, 'dummy.ttl');
      const data = fs.readFileSync(p);
      return expect(actor.run({ url: p, context })).resolves
        .toMatchObject<IActorRdfDereferenceOutput>(
        {
          data: {
            // @ts-expect-error
            data,
            mediaType: 'text/turtle',
          },
          exists: true,
          metadata: { triples: false },
          url: p,
        },
      );
    });

    it('should run if a mediatype is provided', () => {
      const p = path.join(__dirname, 'dummy.ttl');
      const data = fs.readFileSync(p);
      return expect(actor.run({ url: p, mediaType: 'text/turtle', context })).resolves
        .toMatchObject<IActorRdfDereferenceOutput>(
        {
          data: {
            // @ts-expect-error
            data,
            mediaType: 'text/turtle',
          },
          metadata: { triples: false },
          url: p,
        },
      );
    });

    it('should run for file:/// paths', () => {
      let p = path.join(__dirname, 'dummy.ttl');
      const data = fs.readFileSync(p);
      p = `file:///${p}`;
      return expect(actor.run({ url: p, mediaType: 'text/turtle', context })).resolves
        .toMatchObject<IActorRdfDereferenceOutput>(
        {
          data: {
            // @ts-expect-error
            data,
            mediaType: 'text/turtle',
          },
          metadata: { triples: false },
          url: p,
        },
      );
    });

    it('should not find a mediatype if an unknown extension is provided', () => {
      const p = path.join(__dirname, 'dummy.unknown');
      const data = fs.readFileSync(p);
      return expect(actor.run({ url: p, context })).resolves.toMatchObject<IActorRdfDereferenceOutput>(
        {
          data: {
            // @ts-expect-error
            data,
          },
          metadata: { triples: false },
          url: p,
        },
      );
    });

    it('should not find a mediatype if there is no file extension', () => {
      const p = path.join(__dirname, 'dummy');
      const data = fs.readFileSync(p);
      return expect(actor.run({ url: p, context })).resolves.toMatchObject<IActorRdfDereferenceOutput>(
        {
          data: {
            // @ts-expect-error
            data,
          },
          metadata: { triples: false },
          url: p,
        },
      );
    });

    it('should run and receive parse errors', async() => {
      const p = path.join(__dirname, 'dummy.ttl');
      context = new ActionContext({ emitParseError: true });
      const output = await actor.run({ url: p, context });
      expect(output.url).toEqual(p);
      await expect(arrayifyStream(output.data)).rejects.toThrow(new Error('Parse error'));
    });

    it('should run and ignore parse errors in lenient mode', async() => {
      const p = path.join(__dirname, 'dummy.ttl');
      context = new ActionContext({ emitParseError: true, [KeysInitQuery.lenient.name]: true });
      const spy = jest.spyOn(actor, <any> 'logError');
      const output = await actor.run({ url: p, context });
      expect(output.url).toEqual(p);
      expect(await arrayifyStream(output.data)).toEqual([]);
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('should not run on parse rejects', () => {
      const p = path.join(__dirname, 'dummy.ttl');
      context = new ActionContext({ parseReject: true });
      return expect(actor.run({ url: p, context }))
        .rejects.toThrow(new Error('Parse reject error'));
    });

    it('should run and ignore parse rejects in lenient mode', async() => {
      const p = path.join(__dirname, 'dummy.ttl');
      context = new ActionContext({ parseReject: true, [KeysInitQuery.lenient.name]: true });
      const spy = jest.spyOn(actor, <any> 'logError');
      const output = await actor.run({ url: p, context });
      expect(output.url).toEqual(p);
      expect(await arrayifyStream(output.data)).toEqual([]);
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });
});
