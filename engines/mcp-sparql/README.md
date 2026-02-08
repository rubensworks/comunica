# Comunica SPARQL

[![npm version](https://badge.fury.io/js/%40comunica%2Fmcp-sparql.svg)](https://www.npmjs.com/package/@comunica/mcp-sparql)

Comunica MCP SPARQL is an MCP server for executing SPARQL queries over decentralized RDF knowledge graphs on the Web.

It's main distinguishing features are the following:

* Execute [SPARQL 1.2](https://www.w3.org/TR/sparql12-query/) queries over one or more knowledge graphs on the Web.
* Federated querying over [heterogeneous interfaces](https://comunica.dev/docs/query/advanced/source_types/), such as RDF files, SPARQL endpoints, [Triple Pattern Fragments](https://linkeddatafragments.org/), or [Solid data pods](https://inrupt.com/solid).

**[Learn more about Comunica on our website](https://comunica.dev/).**

_Internally, this is a [Comunica module](https://comunica.dev/) that is configured with modules to execute SPARQL queries._

## Supported by

Comunica is a community-driven project, sustained by the [Comunica Association](https://comunica.dev/association/).
If you are using Comunica, [becoming a sponsor or member](https://opencollective.com/comunica-association) is a way to make Comunica sustainable in the long-term.

Our top sponsors are shown below!

<a href="https://opencollective.com/comunica-association/sponsor/0/website" target="_blank"><img src="https://opencollective.com/comunica-association/sponsor/0/avatar.svg"></a>
<a href="https://opencollective.com/comunica-association/sponsor/1/website" target="_blank"><img src="https://opencollective.com/comunica-association/sponsor/1/avatar.svg"></a>
<a href="https://opencollective.com/comunica-association/sponsor/2/website" target="_blank"><img src="https://opencollective.com/comunica-association/sponsor/2/avatar.svg"></a>
<a href="https://opencollective.com/comunica-association/sponsor/3/website" target="_blank"><img src="https://opencollective.com/comunica-association/sponsor/3/avatar.svg"></a>

## Installation

Comunica requires [Node.JS](http://nodejs.org/) 14.0 or higher and is tested on OSX and Linux.

The easiest way to install the client is by installing it from NPM as follows:

```bash
$ [sudo] npm install -g @comunica/mcp-sparql
```

Alternatively, you can install from the latest GitHub sources.
For this, please refer to the README of the [Comunica monorepo](https://github.com/comunica/comunica).
If you do so, the following examples require replacing `comunica-mcp-sparql` with `node engines/mcp-sparql/bin/mcp.js`.

## Connect this MCP server to your agent

## Claude Desktop

After installing, you can run the MCP server in two modes:

#### Stdio Mode (Recommended for Claude Desktop)

With stdio mode, the MCP server communicates directly via standard input/output, which is simpler and doesn't require a network port.

Add the following entry to your `claude_desktop_config.json` file (can be found via Settings / Developer / Edit Config):

```json
{
  "mcpServers": {
    "sparql": {
      "command": "npx",
      "args": [
        "-y",
        "@comunica/mcp-sparql",
        "--mode",
        "stdio"
      ]
    }
  }
}
```

#### HTTP Mode

Alternatively, you can run the MCP server in HTTP mode, which requires starting the server manually first:

```bash
$ comunica-mcp-sparql --mode http --port 3123
```

Then, add the following entry to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "sparql": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "http://localhost:3123/mcp",
        "--allow-http"
      ]
    }
  }
}
```

Then, you can ask Claude something like the following:

> Use SPARQL to determine what movies both Brad Pitt and Leonardo DiCaprio both play in.

## Claude Code

#### Stdio Mode (Recommended for Claude Code)

With stdio mode, the MCP server communicates directly via standard input/output, which is simpler and doesn't require a network port.

```bash
claude mcp add --transport stdio sparql -- npx -y @comunica/mcp-sparql --mode stdio
```

Learn more in the [Claude Code MCP docs](https://code.claude.com/docs/en/mcp),
such as for running this on Windows.

#### HTTP Mode

Alternatively, you can run the MCP server in HTTP mode, which requires starting the server manually first:

```bash
$ comunica-mcp-sparql --mode http --port 3123
```

```bash
claude mcp add --transport http sparql http://localhost:3123/mcp
```

## ChatGPT

At the time of writing, ChatGPT only supports HTTP-based MCP servers.
So you'll need to run this tool under HTTP mode and expose it to the public Web,
possibly combined with a reverse proxy and/or OAuth layer.

```bash
$ comunica-mcp-sparql --mode http --port 3123
```

## Available Tools

This MCP server provides the following tools:

### query_sparql

Execute SPARQL queries over one or more remote sources (SPARQL endpoints, TPF interfaces, or RDF files), which also includes update queries.

**Parameters:**
- `query` (required): SPARQL query string
- `sources` (required): List of SPARQL endpoint URLs, TPF interface URLs, or Linked Data (RDF) file paths
- `queryFormatLanguage` (optional): Query language (e.g., `sparql`, `graphql`). Allows you to specify alternative query languages supported by Comunica
- `queryFormatVersion` (optional): Query language version (e.g., `1.0`, `1.1`, `1.2`). Specifies the version of the query language to use
- `baseIRI` (optional): Base IRI for resolving relative IRIs in the query
- `httpProxy` (optional): HTTP proxy URL (e.g., `http://proxy.example.com:8080`)
- `httpAuth` (optional): HTTP basic authentication in the format `username:password`
- `httpTimeout` (optional): HTTP request timeout in milliseconds
- `httpRetryCount` (optional): Number of HTTP request retries on failure

### query_sparql_rdf

Execute SPARQL queries over a serialized RDF dataset provided as a string (useful for querying Turtle, N-Triples, or other RDF formats directly).

**Parameters:**
- `query` (required): SPARQL query string
- `value` (required): Serialized RDF dataset as a string
- `mediaType` (required): Media type of the serialized RDF dataset (e.g., `text/turtle`, `application/n-triples`, `application/ld+json`)
- `fileBaseIRI` (optional): Base IRI for resolving relative IRIs in the RDF dataset
- `baseIRI` (optional): Base IRI for resolving relative IRIs in the query
- `queryFormatLanguage` (optional): Query language (e.g., `sparql`, `graphql`). Allows you to specify alternative query languages supported by Comunica
- `queryFormatVersion` (optional): Query language version (e.g., `1.0`, `1.1`, `1.2`). Specifies the version of the query language to use

## Learn more

This README just shows the tip of the iceberg!
Learn more about Comunica's functionalities in the following guides:

* _[*Full documentation*](https://comunica.dev/docs/)_
