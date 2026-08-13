# AI Agents (MCP)

::: warning Prerelease
[JuliaMCP.jl](https://github.com/julia-vscode/JuliaMCP.jl) is currently a prerelease package and is not yet registered. The set of tools and resources it exposes may change.
:::

[JuliaMCP.jl](https://github.com/julia-vscode/JuliaMCP.jl) is an [MCP](https://modelcontextprotocol.io) server that gives AI coding agents access to a live Julia development environment. It wraps the same engines as the [VS Code extension](./vscode) and exposes them over stdio.

That means an agent can list and run individual test items, read the resulting failures and coverage, get diagnostics for a file, format code, and evaluate expressions in a persistent session — instead of shelling out to `julia` and scraping stdout. Test processes and sessions stay alive between calls, so repeated work is cheap.

## Installation

JuliaMCP is a [Julia app](https://pkgdocs.julialang.org/v1/apps/) and requires **Julia 1.12 or newer**:

```julia
using Pkg
Pkg.Apps.add(url="https://github.com/julia-vscode/JuliaMCP.jl")
```

This installs a `juliamcp` executable into `~/.julia/bin`. Make sure that directory is on your `PATH`.

## Usage

Point your MCP client at the `juliamcp` command. For clients using the common `mcpServers` JSON format:

```json
{
  "mcpServers": {
    "julia": {
      "command": "juliamcp"
    }
  }
}
```

The server starts with no workspace loaded, so an agent's first call is normally `julia_set_workspace_folders` to tell it which directories to analyze.

## What it exposes

Every tool is prefixed `julia_`, grouped into workspace management, code analysis (diagnostics and formatting), test items (listing, running, results, coverage, and process control), and persistent REPL sessions. Alongside them are resources for reading large output out of band — workspace state, test run summaries, process output, and session output.

**For the complete list of tools and resources, see the [JuliaMCP.jl README](https://github.com/julia-vscode/JuliaMCP.jl#readme)**, which is the reference for this package and is kept current with the code.
