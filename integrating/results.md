# Result formats

A test run produces one aggregated result — a `TestrunResult`, defined in TestItemControllers' `Results` submodule and re-exported by [TestItemRuns](./testitemruns) — that can be written as JSON, JUnit XML or LCOV. `juliati` writes all three ([`--results-json`](../guide/cli#json-results), [`--junit-xml`](../guide/cli#junit-xml), `--coverage-lcov`), the [`julia-run-testitems`](../guide/actions#julia-run-testitems) action produces them in CI, and [`julia-report-ci-results`](../guide/actions#julia-report-ci-results) consumes the JSON to build the workflow summary. If you write a runner, emit these formats and every downstream tool works; if you write a reporter, read them.

## The result object

```julia
result.definition_errors   # Vector{TestrunResultDefinitionError}
result.testitems           # Vector{TestrunResultTestitem}: name, uri, id, profiles
result.process_outputs     # Dict{String,String}: test process id → what it printed outside test items
result.coverage            # nothing, or Vector{TestrunResultFileCoverage}
```

Each test item entry has one `TestrunResultTestitemProfile` per profile it ran under (`profile_name`, `status`, `duration`, `messages`, `output`, `perf`). Results of one item from several profiles — or several CI matrix legs — are merged by `(name, uri)`, so a matrix run reads as one table with one column per leg. Constructors are exported for tools that build a result from their own callbacks; `TestItemRuns` builds it for you.

## JSON

`write_json(io_or_path, result)` / `read_json(io_or_path)`. Field names are the Julia field names (snake_case); `nothing` is `null`.

```jsonc
{
  "definition_errors": [
    { "message": "The test item name \"x\" is used more than once in this file. …",
      "uri": "file:///home/me/MyPkg/test/a.jl", "line": 12, "column": 1 }
  ],
  "testitems": [
    {
      "name": "parses floats",
      "uri": "file:///home/me/MyPkg/test/parsing_tests.jl",
      "id": "MyPkg@a1b2c3d4/test/parsing_tests.jl::parses floats",   // "" in files from older producers
      "profiles": [
        {
          "profile_name": "Julia 1.12 / ubuntu-latest",
          "status": "failed",            // passed | failed | errored | skipped | timeout | crash
          "duration": 12.4,              // milliseconds; null when the controller synthesised the result
          "messages": [                  // null when there are none
            {
              "message": "Test Failed at …\n  Expression: parse(Float64, \"1.5\") == 1.6\n …",
              "expected_output": "1.6",  // null when not applicable
              "actual_output": "1.5",
              "uri": "file:///home/me/MyPkg/test/parsing_tests.jl",   // "" when unknown
              "line": 4,                 // 0 when unknown
              "column": 5,
              "stack_frames": [          // null when there are none
                { "label": "top-level scope", "uri": "file:///…/parsing_tests.jl", "line": 4, "column": 5 }
              ]
            }
          ],
          "output": "Test Summary: | Fail  Total\n…",   // captured output, null when empty
          "perf": {                      // null when the test process did not measure
            "elapsed": 12.4, "bytes": 20480, "allocs": 312,
            "gctime": 0.0, "compile_time": 8.1, "recompile_time": null
          }
        }
      ]
    }
  ],
  "process_outputs": { "0f2c…": "Precompiling MyPkg...\n" },
  "coverage": [                          // null unless the run collected coverage
    { "uri": "file:///home/me/MyPkg/src/MyPkg.jl", "coverage": [null, 1, 1, 0, null] }
  ]
}
```

`read_json` is tolerant: `perf`, `id` and `coverage` were added over time and are read as `null` when absent, so a reporter can merge files written by different producer versions — which is exactly what `julia-report-ci-results` does across matrix legs.

## JUnit XML

`write_junit_xml(io_or_path, result; root=nothing)` renders the same data for tools that speak JUnit (CI dashboards, test-report actions, IDE importers). `root` — a directory path or `file:` URI — should be the folder the tests were run from, and must be absolute.

| JUnit | Comes from |
|---|---|
| `<testsuites tests failures errors skipped time>` | Totals; `tests` counts test cases plus definition errors. |
| one `<testsuite name="test/parsing_tests.jl">` | per source file (path relative to `root`, `/`-separated; the absolute path or raw URI when it cannot be relativized). |
| one `<testcase classname name id time>` | per (test item × profile). `classname` = the relative file path, `name` = the item name, `id` = the stable test item id. |
| `<failure>` | `status == "failed"`, with the messages. |
| `<error>` | `errored`, `timeout`, `crash` (JUnit has no spelling for the last two; the message says which). |
| `<skipped>` | `skipped`. |
| `<system-out>` | The item's captured output. |
| `<properties>` | Perf stats. |
| `<testsuite name="Definition errors">` | A synthetic suite holding one errored case per definition error, so a suite that failed to parse is not mistaken for an empty one. |

ANSI escape sequences are stripped and XML-invalid characters dropped, so raw Julia output is safe in the file.

## LCOV

`write_lcov(io_or_path, result) -> Bool` writes the merged line coverage in LCOV format for services such as Codecov. It returns `false` and writes nothing when the run collected no coverage — the normal outcome of a run without a coverage profile, not an error. Only `file:` URIs are written (they are converted back to absolute paths); one `SF:` record per file, `DA:` lines for every instrumentable line.

Coverage is collected per test item and merged per file across the whole run; a run with several profiles merges them too.
