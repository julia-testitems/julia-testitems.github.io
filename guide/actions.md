# GitHub Actions

The [reusable workflow](./ci) is built out of individual GitHub Actions. The three that make up the test pipeline are documented here, because each is also usable on its own — which is what you want when the workflow's shape does not fit: you already have a CI pipeline, you need extra steps between the test matrix and the report, or you only want to run test items and handle the rest yourself.

::: tip Start with the workflow
If you are setting up CI for a package from scratch, use the [reusable workflow](./ci) instead. It wires these together, along with caching, coverage upload, linting, format checking, docs deployment, and TagBot. Reach for the individual actions when you need control the workflow does not give you.
:::

| Action | Purpose |
| --- | --- |
| [`julia-actions/julia-run-testitems`](#julia-run-testitems) | Run test items via `juliati` |
| [`julia-actions/julia-compute-test-matrix`](#julia-compute-test-matrix) | Derive a version/platform matrix from `[compat]` |
| [`julia-actions/julia-report-ci-results`](#julia-report-ci-results) | Render a job summary from results and lint output |

::: warning Interfaces may still change
`julia-report-ci-results` documents its interface as still subject to change. Pin a major version, as shown below, and check the release notes when you bump.
:::

## julia-run-testitems

Runs all test items under a path using the [`juliati` CLI](./cli), emits GitHub error annotations for failures, and fails the step if anything did not pass.

```yaml
- uses: julia-actions/julia-run-testitems@v2
  with:
    testitem-timeout: 600
```

It installs its own pinned Julia environment, so you do not need to install TestItemApp yourself. You do still need a checkout, and for the test processes a Julia version — combine it with `julia-actions/install-juliaup` and `julia-actions/cache`.

### Inputs

| Input | Default | Description |
| --- | --- | --- |
| `test-path` | `.` | Directory to search for test items, relative to the workspace. |
| `juliaup-channel` | `release` | Juliaup channel used for the test worker processes. |
| `results-path` | — | Path to write the test-run results JSON. Mainly the integration point for `julia-report-ci-results`; leave unset when you are not aggregating results. |
| `env` | — | Environment variables for the test processes, as a JSON object string, e.g. `'{"FOO": "bar"}'` (not `KEY=VALUE` lines). |
| `filter` | — | Julia expression over `name`, `tags`, `filename`, `package_name`; only items for which it is true are run, e.g. `':ci in tags'`. |
| `profile-name` | `Default` | Profile name recorded in the results JSON. |
| `testitem-timeout` | `1200` | Per-test-item timeout in seconds. |
| `coverage` | `false` | Run the test processes in coverage mode. |
| `max-workers` | the `juliati` default | Maximum number of parallel test processes. |
| `check-bounds` | `yes` | `--check-bounds` mode. `yes` forces bounds checks everywhere, matching `Pkg.test` semantics; `auto` respects `@inbounds` and reuses existing precompile caches. |
| `annotations` | `true` | Emit GitHub error annotations for failed test items. |

::: tip `check-bounds` differs from the CLI
This action defaults to `yes` — CI should prefer catching out-of-bounds bugs over starting quickly — whereas `juliati` on your machine defaults to `auto`. See [Bounds checking](./cli#bounds-checking).
:::

### Outputs

| Output | Description |
| --- | --- |
| `results-path` | Path of the results JSON that was written (empty if none was). |

Note that when `annotations` is `true` and you did not set `results-path`, the action writes results to a temporary file anyway so it has something to annotate from — so this output may be non-empty even when you asked for no results file.

## julia-compute-test-matrix

Reads the `julia` bound from `[compat]` in your `Project.toml` and turns it into a CI matrix of Julia versions and platforms. Needs a checkout and network access to the Julia version database, but no Julia installation.

```yaml
jobs:
  matrix:
    runs-on: ubuntu-latest
    outputs:
      test-matrix: ${{ steps.compute.outputs.test-matrix }}
    steps:
      - uses: actions/checkout@v7
      - uses: julia-actions/julia-compute-test-matrix@v2
        id: compute

  test:
    needs: matrix
    strategy:
      fail-fast: false
      matrix:
        include: ${{ fromJson(needs.matrix.outputs.test-matrix) }}
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v7
      - uses: julia-actions/install-juliaup@v3
        with:
          channel: ${{ matrix.juliaup-channel }}
      - uses: julia-actions/julia-run-testitems@v2
```

### Inputs

| Input | Default | Description |
| --- | --- | --- |
| `project-path` | `.` | Directory containing the `Project.toml` (or `JuliaProject.toml`) whose `[compat] julia` bound is used. |
| `include-release-versions` | `true` | Include the current Julia release version. |
| `include-lts-versions` | `true` | Include the current Julia LTS version. |
| `include-smallest-compatible-minor-versions` | `true` | Include the smallest minor version compatible with the compat bound. |
| `include-all-compatible-minor-versions` | `false` | Include the latest patch of every compatible minor version. |
| `include-rc-versions` | `false` | Include the rc channel (skipped if it resolves to a version already in the matrix). |
| `include-beta-versions` | `false` | Include the beta channel (same caveat). |
| `include-alpha-versions` | `false` | Include the alpha channel (same caveat). |
| `include-nightly-versions` | `false` | Include the nightly channel. |
| `include-linux-x64` | `true` | Linux x64 (`ubuntu-latest`). |
| `include-linux-x86` | `true` | Linux x86 (`ubuntu-latest`). |
| `include-windows-x64` | `true` | Windows x64 (`windows-latest`). |
| `include-windows-x86` | `true` | Windows x86 (`windows-latest`). |
| `include-macos-x64` | `true` | macOS x64 (`macos-26-intel`). |
| `include-macos-aarch64` | `true` | macOS aarch64 (`macos-26`). |

### Outputs

| Output | Description |
| --- | --- |
| `test-matrix` | JSON array of `{"os", "juliaup-channel", "experimental"}` entries for `strategy.matrix.include` via `fromJson`. `juliaup-channel` has the form `<version>~<arch>` or `<rc\|beta\|alpha\|nightly>~<arch>`; `experimental` is `true` for pre-release entries. |

## julia-report-ci-results

Renders a single job summary from the test-result JSON files produced across your matrix, plus optional lint SARIF. It merges and deduplicates results across matrix legs and profiles, and uploads the full test process outputs as a `test-process-logs` artifact.

This action needs no Julia, no checkout, and no token, and makes no GitHub API calls — so it works on pull requests from forks.

```yaml
report:
  needs: test
  if: always()
  runs-on: ubuntu-latest
  steps:
    - uses: actions/download-artifact@v8
      with:
        path: testresults
        pattern: testresults-*
        merge-multiple: true
    - uses: julia-actions/julia-report-ci-results@v2
      with:
        results-path: testresults
```

Have the test jobs upload the file that `julia-run-testitems` wrote (via its `results-path` input) as an artifact, then download them all here.

### Inputs

| Input | Default | Description |
| --- | --- | --- |
| `results-path` | **required** | Directory containing test-result `*.json` files as written by `julia-run-testitems`. |
| `lint-results-path` | — | Directory containing lint `*.sarif` file(s); may be missing or empty if lint was skipped. |
| `fail-on-missing-results` | `true` | Fail when no test-result files are found. |
| `fail-on-test-failures` | `true` | Fail when there are failing test items or test definition errors. |
| `fail-on-lint-errors` | `true` | Fail when there are error-severity lint results. |
| `process-logs-retention-days` | repository default | Retention for the uploaded `test-process-logs` artifact. |

### Outputs

| Output | Description |
| --- | --- |
| `failed` | Whether any CI issues were found, independent of the `fail-on-*` settings. |
| `test-count` | Number of distinct test items in the report. |
| `failed-count` | Number of test items with issues. |
| `definition-error-count` | Number of test definition errors. |
| `lint-error-count` | Number of error-severity lint results. |
| `process-logs-artifact-id` | ID of the uploaded artifact (empty when nothing was uploaded). |

The summary is truncated safely if it would exceed GitHub's 1 MiB job summary limit; the complete output is always in the artifact.
