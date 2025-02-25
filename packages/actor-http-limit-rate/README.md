# Comunica HTTP Rate Limit Actor

[![npm version](https://badge.fury.io/js/%40comunica%2Factor-http-limit-rate.svg)](https://www.npmjs.com/package/@comunica/actor-http-limit-rate)

An [HTTP](https://github.com/comunica/comunica/tree/master/packages/bus-http) actor that performs rate limiting,
by spacing out future requests based on past request durations,
in an attempt to match the number of requests sent per second to the number of responses served per second by the server.
By default, the actor waits for the first request to fail for a given host prior to spacing out requests.

This module is part of the [Comunica framework](https://github.com/comunica/comunica),
and should only be used by [developers that want to build their own query engine](https://comunica.dev/docs/modify/).

[Click here if you just want to query with Comunica](https://comunica.dev/docs/query/).

## Install

```bash
$ yarn add @comunica/actor-http-limit-rate
```

## Configure

After installing, this package can be added to your engine's configuration as follows:

```json
{
  "@context": [
    "https://linkedsoftwaredependencies.org/bundles/npm/@comunica/actor-http-limit-rate/^4.0.0/components/context.jsonld"
  ],
  "actors": [
    {
      "@id": "urn:comunica:default:http/actors#limit-rate",
      "@type": "ActorHttpLimitRate"
    }
  ]
}
```

### Config Parameters

* `mediatorHttp`: A mediator over the [HTTP bus](https://github.com/comunica/comunica/tree/master/packages/bus-http).
* `httpInvalidator`: A mediator over the [HTTP invalidate bus](https://github.com/comunica/comunica/tree/master/packages/bus-http-invalidate).
* `correctionMultiplier`: How aggressively the request interval should follow the latest response time. Defaults to `0.1`.
* `failureMultiplier`: The response time of a failed request is taken into account with this multiplier applied. Defaults to `10.0`.
* `limitByDefault`: Whether the actor should do rate limiting by default, already before a request fails. Defaults to `false`.
* `allowOverlap`: Whether the actor should allow overlapping requests to be sent to the server when rate limiting is applied. Defaults to `false`.
