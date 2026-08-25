# Configuration

Test item discovery can be configured with a `JuliaTestItems.toml` file in your
project. Every surface that finds test items reads it — [VS Code](./vscode),
[DevREPL](./repl), the [`juliati`](./cli) command line tool, [CI](./ci), and
[JuliaMCP](./mcp) — so a single file keeps them all in agreement.

The file is entirely optional. Without one, every `.jl` file in your project is
searched for `@testitem` blocks, which is the right behavior for almost all
packages.

## When you need it

Discovery scans `.jl` files for `@testitem` blocks. That is usually what you
want, but not always:

- **Vendored or generated code.** A `deps/` or `gen/` folder containing copied
  third-party sources may hold `@testitem` blocks that are not yours to run.
- **Scratch or manual tests.** Files you keep around for interactive debugging,
  which should not appear in the test explorer or run in CI.
- **Large projects.** Restricting the scan to the folders that actually contain
  tests avoids searching the rest.

## The file

Place `JuliaTestItems.toml` in your project root:

```toml
# Only look for test items in these folders.
include = ["src/**", "test/**"]

# ...but never in these.
exclude = ["test/manual/**"]
```

Both keys are optional:

| Key | Default | Meaning |
| --- | --- | --- |
| `include` | everything | Only files matching one of these patterns are searched. |
| `exclude` | nothing | Files matching any of these are never searched, even if `include` matches them. |
| `config-version` | `1` | The config format version. You can leave it out. |

`exclude` always wins over `include`.

Excluded files are invisible to the framework: their test items do not appear in
the VS Code test explorer, are not listed by the CLI, and never run in CI.

::: tip
Excluding a file only stops it being **searched for test items**. It does not
stop the file being part of your package, and it does not stop the linter from
checking it.
:::

## Glob patterns

Patterns are gitignore-style and are relative to the folder containing the
config file:

| Pattern | Matches |
| --- | --- |
| `test/**` | Everything under `test/`, at any depth |
| `*.jl` | Any `.jl` file, at any depth |
| `/setup.jl` | Only `setup.jl` in the config file's own folder |
| `test/manual_*.jl` | `manual_foo.jl` directly inside `test/` |
| `gen/` | Everything below the `gen/` folder |
| `test/?.jl` | A single-character name, like `test/a.jl` |

A leading `/` anchors a pattern to the config file's folder. A pattern with no
`/` in it matches at any depth. Windows path separators are handled
automatically — write `/` and it works everywhere.

## Where the file applies

**Every `JuliaTestItems.toml` above a file has a say, and all of them must agree.**

A file is searched only if each config file from the top of the tree down to its
own folder admits it, each one's globs read relative to its own folder. A nested
file can therefore narrow what an outer one selected, but it can never widen it.

```
mypackage/
  JuliaTestItems.toml       exclude = ["**/scratch_*.jl"]
  src/
    MyPackage.jl            ← searched: the root file admits it
  test/
    JuliaTestItems.toml     include = ["test_*.jl"]
    test_core.jl            ← searched: both files admit it
    scratch_notes.jl        ← not searched: the root file excludes it
```

`test/scratch_notes.jl` would stay excluded even if `test/JuliaTestItems.toml`
said `include = ["**"]`. That is the point of the rule: it is how you seal off a
subtree you do not own — write the exclusion in the config file at the root of the
project that vendors it, and nothing inside can take it back.

A single `JuliaTestItems.toml` at the root should still be your default. When part
of the tree needs different settings, reach for an `[[override]]` block in that one
file before adding a second file. A nested file is a last resort, for a subtree
that is genuinely independent of the project, such as a vendored repository.

## Reporting problems in test items

A malformed `@testitem` — an unknown keyword argument, a missing name — is
reported as a *diagnostic*, not as a discovery problem. That is the linter's job,
controlled by the `testitem_errors` rule in `JuliaLint.toml`:

```toml
# JuliaLint.toml
[rules]
testitem_errors = "error"    # the default
```

So the two files divide the work: `JuliaTestItems.toml` decides **where test
items are looked for**, and `JuliaLint.toml` decides **whether broken ones are
reported**.

## What is not configurable (yet)

`JuliaTestItems.toml` currently controls discovery scope only. Execution
settings — worker counts, timeouts, environment variables, default tag filters,
per-item defaults, and the [test process](./test-processes) settings for GC
between test items, memory-threshold recycling and scheduling — are still set per
surface: in VS Code settings, as flags to [DevREPL](./repl#run-flags) and
[`juliati`](./cli#options), or as inputs in your [CI configuration](./ci).

Those settings are planned as additional sections in this same file. The keys
documented above will keep working when they arrive.

## Full reference

For the complete specification of the file format — including the `[[override]]`
mechanism shared with `JuliaLint.toml` and `JuliaFormat.toml` — see the
[JuliaWorkspaces configuration reference](https://www.julia-vscode.org/JuliaWorkspaces.jl/dev/configuration/).
