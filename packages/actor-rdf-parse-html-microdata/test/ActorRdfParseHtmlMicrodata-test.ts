import { ActorRdfParseHtml } from '@comunica/bus-rdf-parse-html';
import { KeysInitQuery } from '@comunica/context-entries';
import { ActionContext, Bus } from '@comunica/core';
import type { IActionContext } from '@comunica/types';
import { MicrodataRdfParser } from 'microdata-rdf-streaming-parser';
import { DataFactory } from 'rdf-data-factory';
import { ActorRdfParseHtmlMicrodata } from '../lib/ActorRdfParseHtmlMicrodata';
import '@comunica/utils-jest';

const quad = require('rdf-quad');

const DF = new DataFactory();

describe('ActorRdfParseHtmlMicrodata', () => {
  let bus: any;
  let context: IActionContext;

  beforeEach(() => {
    bus = new Bus({ name: 'bus' });
    context = new ActionContext({ [KeysInitQuery.dataFactory.name]: DF });
  });

  describe('The ActorRdfParseHtmlMicrodata module', () => {
    it('should be a function', () => {
      expect(ActorRdfParseHtmlMicrodata).toBeInstanceOf(Function);
    });

    it('should be a ActorRdfParseHtmlMicrodata constructor', () => {
      expect(new (<any> ActorRdfParseHtmlMicrodata)({ name: 'actor', bus })).toBeInstanceOf(ActorRdfParseHtmlMicrodata);
      expect(new (<any> ActorRdfParseHtmlMicrodata)({ name: 'actor', bus })).toBeInstanceOf(ActorRdfParseHtml);
    });

    it('should not be able to create new ActorRdfParseHtmlMicrodata objects without \'new\'', () => {
      expect(() => {
        (<any> ActorRdfParseHtmlMicrodata)();
      }).toThrow(`Class constructor ActorRdfParseHtmlMicrodata cannot be invoked without 'new'`);
    });
  });

  describe('An ActorRdfParseHtmlMicrodata instance', () => {
    let actor: ActorRdfParseHtmlMicrodata;

    beforeEach(() => {
      actor = new ActorRdfParseHtmlMicrodata({ name: 'actor', bus });
    });

    describe('test', () => {
      it('should return true', async() => {
        await expect(actor.test(<any> {})).resolves.toPassTestVoid();
      });
    });

    describe('run', () => {
      let baseIRI: string;
      let headers: any;
      let emit: any;
      let error: any;
      let end: any;
      let action: any;

      beforeEach(() => {
        baseIRI = 'http://example.org/';
        headers = {
          get(key: string) {
            if (key === 'content-type') {
              return 'xml';
            }
            return null;
          },
        };
        emit = jest.fn();
        error = jest.fn();
        end = jest.fn();
        action = { baseIRI, headers, emit, error, end, context };
      });

      it('should return an MicrodataParser', async() => {
        const listener = (await actor.run(action)).htmlParseListener;
        expect(listener).toBeInstanceOf(MicrodataRdfParser);
      });

      it('should set the profile, baseIRI and language', async() => {
        const listener = (await actor.run(action)).htmlParseListener;
        expect((<any> listener).util.baseIRI).toBe('http://example.org/');
      });

      it('should set the profile, baseIRI and language for empty headers', async() => {
        headers = { get: () => null };
        action = { baseIRI, headers, emit, error, end, context };

        const listener = (await actor.run(action)).htmlParseListener;
        expect((<any> listener).util.baseIRI).toBe('http://example.org/');
      });

      it('should set the profile, baseIRI and language for null headers', async() => {
        headers = null;
        action = { baseIRI, headers, emit, error, end, context };

        const listener = (await actor.run(action)).htmlParseListener;
        expect((<any> listener).util.baseIRI).toBe('http://example.org/');
      });

      it('should be a valid html listener', async() => {
        const listener = (await actor.run(action)).htmlParseListener;

        listener.onTagOpen('html', {});
        listener.onTagOpen('body', {
          itemid: '',
          itemscope: '',
          lang: 'en-us',
          itemtype: 'http://purl.org/dc/terms/Thing',
        });
        listener.onTagOpen('p', { itemprop: 'title' });
        listener.onText('Title');
        listener.onTagClose();
        listener.onTagOpen('p', { itemprop: 'title2' });
        listener.onText('Title2');
        listener.onTagClose();
        listener.onTagClose();
        listener.onTagClose();
        listener.onEnd();

        expect(emit).toHaveBeenCalledTimes(3);
        expect(emit).toHaveBeenNthCalledWith(
          1,
          quad('http://example.org/', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', 'http://purl.org/dc/terms/Thing'),
        );
        expect(emit).toHaveBeenNthCalledWith(
          2,
          quad('http://example.org/', 'http://purl.org/dc/terms/title', '"Title"@en-us'),
        );
        expect(emit).toHaveBeenNthCalledWith(
          3,
          quad('http://example.org/', 'http://purl.org/dc/terms/title2', '"Title2"@en-us'),
        );
        expect(error).not.toHaveBeenCalled();
        expect(end).toHaveBeenCalledTimes(1);
      });

      it('should be a valid html listener that delegates error events', async() => {
        const listener = (await actor.run(action)).htmlParseListener;
        const e = new Error('abc');
        (<any> listener).emit('error', e);
        expect(error).toHaveBeenCalledWith(e);
      });
    });
  });
});
