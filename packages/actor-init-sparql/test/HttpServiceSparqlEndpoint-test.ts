import * as querystring from "querystring";
import {PassThrough} from "stream";
import {http, ServerResponseMock} from "../../../__mocks__/http";
import {parse} from "../../../__mocks__/url";
import {newEngineDynamic} from "../__mocks__/index";
import {HttpServiceSparqlEndpoint} from "../lib/HttpServiceSparqlEndpoint";
const stringToStream = require('streamify-string');

jest.mock('../index', () => {
  return {
    newEngineDynamic,
  };
});

jest.mock("url", () => {
  return {
    parse,
  };
});

jest.mock("http", () => {
  return http;
});

describe('HttpServiceSparqlEndpoint', () => {
  describe('constructor', () => {
    it("shouldn't error if no args are supplied", () => {
      expect(() => new HttpServiceSparqlEndpoint()).not.toThrowError();
    });

    it("should set fields with values from args if present", () => {
      const args = {context: {test: "test"}, timeout: 4321, port: 24321, invalidateCacheBeforeQuery: true};
      const instance = new HttpServiceSparqlEndpoint(args);

      expect(instance.context).toEqual({test: "test"});
      expect(instance.timeout).toBe(4321);
      expect(instance.port).toBe(24321);
      expect(instance.invalidateCacheBeforeQuery).toBeTruthy();
    });

    it("should set default field values for fields that aren't in args", () => {
      const args = {};
      const instance = new HttpServiceSparqlEndpoint(args);

      expect(instance.context).toEqual({});
      expect(instance.timeout).toBe(60000);
      expect(instance.port).toBe(3000);
      expect(instance.invalidateCacheBeforeQuery).toBeFalsy();
    });
  });

  describe('An HttpServiceSparqlEndpoint instance', () => {
    let instance;
    beforeEach(() => {
      instance = new HttpServiceSparqlEndpoint({});
    });

    describe("run", () => {
      const stdout = new PassThrough();
      const stderr = new PassThrough();
      beforeEach(() => {
        http.createServer.mockClear();
        instance.handleRequest.bind = jest.fn(() => "handleRequest_bound");
      });

      it("should set the server's timeout and port number correctly", async () => {
        const port = 201331;
        const timeout = 201331;
        instance.port = port;
        instance.timeout = timeout;
        await instance.run(stdout, stderr);

        const server = http.createServer.mock.results[0].value;
        expect(server.listen).toHaveBeenCalledWith(port);
        expect(server.setTimeout).toHaveBeenCalledWith(2 * timeout);
      });

      it("should call bind handleRequest with the correct arguments", async () => {
        // See mock implementation of getResultMediaTypes in ../index
        const variants = [ { type: 'mtype_1', quality: 1 },
                            { type: 'mtype_2', quality: 2 },
                            { type: 'mtype_3', quality: 3 },
                            { type: 'mtype_4', quality: 4 } ];
        await instance.run(stdout, stderr);

        expect(instance.handleRequest.bind).toBeCalledTimes(1);
        expect(instance.handleRequest.bind).toBeCalledWith(instance, await instance.engine, variants, stdout, stderr);
      });

      it("should call createServer with the correct arguments", async () => {
        await instance.run(stdout, stderr);

        expect(http.createServer).toBeCalledTimes(1);
        expect(http.createServer).toHaveBeenLastCalledWith(instance.handleRequest.bind());
      });
    });

    describe("handleRequest", () => {
      let engine;
      let variants;
      const stdout = new PassThrough();
      const stderr = new PassThrough();
      let request;
      let response;
      beforeEach(async () => {
        instance.writeQueryResult = jest.fn();
        engine = await newEngineDynamic();
        variants = {type: "test_type", quality: 1};
        request = makeRequest();
        response = new ServerResponseMock();
      });

      function makeRequest() {
        request = stringToStream("default_test_request_content");
        request.url = "url_sparql";
        request.headers = {'content-type': "contenttypewhichdefinitelydoesnotexist", 'accept': "*/*"};
        return request;
      }

      it("should use the empty query string when the request method equals GET and url parsing fails"
          , async () => {
            request.method = "GET";
            request.url = "url_undefined_query";
            await instance.handleRequest(engine, variants, stdout, stderr, request, response);

            expect(instance.writeQueryResult).toHaveBeenCalledWith(engine, stdout, stderr,
                request, response, '', null, false);
          });

      it("should use the parsed query string when the request method equals GET"
          , async () => {
            request.method = "GET";
            await instance.handleRequest(engine, variants, stdout, stderr, request, response);

            expect(instance.writeQueryResult).toHaveBeenCalledWith(engine, stdout, stderr,
                request, response, 'test_query', null, false);
          });

      it("should set headonly and use the empty query string when the request method is HEAD and url parsing fails"
          , async () => {
            request.method = "HEAD";
            request.url = "url_undefined_query";
            await instance.handleRequest(engine, variants, stdout, stderr, request, response);

            expect(instance.writeQueryResult).toHaveBeenCalledWith(engine, stdout, stderr,
                request, response, '', null, true);
          });

      it("should set headonly and use the parsed query string when the request method is HEAD"
          , async () => {
            request.method = "HEAD";
            await instance.handleRequest(engine, variants, stdout, stderr, request, response);

            expect(instance.writeQueryResult).toHaveBeenCalledWith(engine, stdout, stderr,
                request, response, 'test_query', null, true);
          });

      it("should call writeQueryResult with correct arguments if request method equals POST", async () => {
        instance.parseBody = jest.fn(() => Promise.resolve("test_parseBody_result"));
        request.method = "POST";
        await instance.handleRequest(engine, variants, stdout, stderr, request, response);

        expect(instance.writeQueryResult).toHaveBeenCalledWith(engine, stdout, stderr,
            request, response, "test_parseBody_result", null, false);
      });

      it("should only invalidate cache if invalidateCacheBeforeQuery is set to true", async () => {
        instance.invalidateCacheBeforeQuery = false;
        await instance.handleRequest(engine, variants, stdout, stderr, request, response);

        expect(engine.invalidateHttpCache).not.toHaveBeenCalled();
      });

      it("should invalidate cache if invalidateCacheBeforeQuery is set to true", async () => {
        instance.invalidateCacheBeforeQuery = true;
        await instance.handleRequest(engine, variants, stdout, stderr, request, response);

        expect(engine.invalidateHttpCache).toHaveBeenCalled();
      });

      it("should respond with 404 and end the response with the correct error message if path is incorrect"
          , async () => {
            request.url = "not_urlsparql";
            await instance.handleRequest(engine, variants, stdout, stderr, request, response);

            expect(response.writeHead).toHaveBeenCalledWith(404, { 'Access-Control-Allow-Origin': '*',
              'content-type': HttpServiceSparqlEndpoint.MIME_JSON});
            expect(response.end).toHaveBeenCalledWith(JSON.stringify({ message: 'Resource not found' }));
          });
    });

    describe("writeQueryResult", () => {
      let response;
      let request;
      let query;
      let mediaType;
      let endCalledPromise;
      beforeEach(() => {
        response = new ServerResponseMock();
        request = stringToStream("default_request_content");
        query = "default_test_query";
        mediaType = "default_test_mediatype";
        endCalledPromise = new Promise((resolve) => response.onEnd = resolve);
      });

      it('should end the response with error message content when the query rejects', async () => {
        query = "query_reject";
        await instance.writeQueryResult(await newEngineDynamic(), new PassThrough(), new PassThrough(),
            request, response, query, mediaType, false);

        await expect(endCalledPromise).resolves.toBe("Rejected query");
        expect(response.writeHead).toHaveBeenLastCalledWith(400,
            { 'content-type': HttpServiceSparqlEndpoint.MIME_PLAIN, 'Access-Control-Allow-Origin': '*' });
      });

      it('should end the response with correct error message when the query cannot be serialized for given mediatype'
          , async () => {
            mediaType = "mediatype_throwerror";
            await instance.writeQueryResult(await newEngineDynamic(), new PassThrough(), new PassThrough(),
                request, response, query, mediaType, false);

            await expect(endCalledPromise).resolves.toBe(
                'The response for the given query could not be serialized for the requested media type\n');
            expect(response.writeHead).toHaveBeenLastCalledWith(400,
                { 'content-type': HttpServiceSparqlEndpoint.MIME_PLAIN, 'Access-Control-Allow-Origin': '*' });
          });

      it('should put the query result in the response if the query was successful', async () => {
        await instance.writeQueryResult(await newEngineDynamic(), new PassThrough(), new PassThrough(),
            request, response, query, mediaType, false);

        await expect(endCalledPromise).resolves.toBeFalsy();
        expect(response.writeHead).toHaveBeenCalledTimes(1);
        expect(response.writeHead).toHaveBeenLastCalledWith(200,
            {'content-type': mediaType, 'Access-Control-Allow-Origin': '*'});
        expect(response.toString()).toBe("test_query_result");
      });

      it('should end the response with an internal server error message when the queryresult stream emits an error'
          , async () => {
            mediaType = "mediatype_queryresultstreamerror";
            await instance.writeQueryResult(await newEngineDynamic(), new PassThrough(), new PassThrough(),
                request, response, query, mediaType, false);

            await expect(endCalledPromise).resolves.toBe("An internal server error occurred.\n");
            expect(response.writeHead).toHaveBeenCalledTimes(1);
            expect(response.writeHead).toHaveBeenLastCalledWith(200,
                {'content-type': mediaType, 'Access-Control-Allow-Origin': '*'});
          });

      it('should only write the head when headOnly is true', async () => {
        await instance.writeQueryResult(await newEngineDynamic(), new PassThrough(), new PassThrough(),
            request, response, query, mediaType, true);

        expect(response.writeHead).toHaveBeenCalledTimes(1);
        expect(response.writeHead).toHaveBeenLastCalledWith(200,
            {'content-type': mediaType, 'Access-Control-Allow-Origin': '*'});
        expect(response.end).toHaveBeenCalled();
        expect(response.toString()).toBe("");
      });
    });

    describe("stopResponse", () => {
      let response;
      let eventEmitter;
      const endListener = jest.fn();
      beforeEach(() => {
        endListener.mockClear();
        instance.timeout = 1500;
        response = new ServerResponseMock();
        eventEmitter = stringToStream("queryresult");
        eventEmitter.addListener("test", endListener);
      });

      it("should not error when eventEmitter is undefined", async () => {
        expect(() => instance.stopResponse(response, undefined)).not.toThrowError();
      });

      it('should do nothing when no timeout or close event occurs', async () => {
        instance.stopResponse(response, eventEmitter);
        // Not waiting for timeout to occur

        expect(eventEmitter.listeners("test").length).toEqual(1);
        expect(response.end).not.toHaveBeenCalled();
        expect(endListener).not.toHaveBeenCalled();
      });

      it('should remove event eventlisteners from eventEmitter if timeout occurs', async () => {
        instance.stopResponse(response, eventEmitter);
        await new Promise((resolve) => setTimeout(resolve, 1600)); // Wait for timeout to occur

        expect(eventEmitter.listeners("test").length).toEqual(0);
        expect(response.end).toHaveBeenCalled();
      });

      it('should remove event eventlisteners from eventEmitter when response is closed', async () => {
        instance.stopResponse(response, eventEmitter);
        response.emit("close");

        expect(eventEmitter.listeners("test").length).toEqual(0);
        expect(response.end).toHaveBeenCalled();
      });
    });

    describe('parseBody', () => {
      let httpRequestMock;
      const testRequestBody = "teststring";
      beforeEach(() => {
        httpRequestMock = stringToStream(testRequestBody);
        httpRequestMock.headers = {'content-type': "contenttypewhichdefinitelydoesnotexist"};
      });

      it('should reject if the stream emits an error', () => {
        httpRequestMock._read = () => httpRequestMock.emit('error', new Error('error'));
        return expect(instance.parseBody(httpRequestMock)).rejects.toBeTruthy();
      });

      it('should set encoding of the request to utf8', () => {
        httpRequestMock.setEncoding(null);
        instance.parseBody(httpRequestMock);
        return expect(httpRequestMock._readableState.encoding).toEqual('utf8');
      });

      // tslint:disable-next-line:max-line-length
      it('should return the empty string if the query is invalid and the content-type is application/x-www-form-urlencoded', () => {
        httpRequestMock.headers = {'content-type': "application/x-www-form-urlencoded"};
        return expect(instance.parseBody(httpRequestMock)).resolves.toBe('');
      });

      it('should parse query from url if the content-type is application/x-www-form-urlencoded', () => {
        const exampleQueryString = "query=SELECT%20*%20WHERE%20%7B%3Fs%20%3Fp%20%3Fo%7D";
        httpRequestMock = stringToStream(exampleQueryString);
        httpRequestMock.headers = {'content-type': "application/x-www-form-urlencoded"};

        return expect(instance.parseBody(httpRequestMock)).resolves.toBe(querystring.parse(exampleQueryString).query);
      });

      it('should return input body if content-type is not application/[sparql-query|x-www-form-urlencoded]', () => {
        return expect(instance.parseBody(httpRequestMock)).resolves.toBe(testRequestBody);
      });

      it('should return input body if content-type is application/sparql-query', () => {
        httpRequestMock.headers = {'content-type': "application/sparql-query"};
        return expect(instance.parseBody(httpRequestMock)).resolves.toBe(testRequestBody);
      });
    });
  });
});
