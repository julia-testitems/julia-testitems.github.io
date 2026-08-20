# CI Integration

The test item framework provides GitHub Actions integration for running tests in CI. There are two ways in:

- **The [reusable workflow](#reusable-workflow-recommended)** — one YAML file gives you lint, format check, a full version and platform test matrix, coverage, a job summary, docs deployment, and TagBot. Start here.
- **The [individual actions](./actions)** — the pieces the workflow is built from, for when you already have a pipeline or need control the workflow does not offer.

## Reusable Workflow (Recommended)

The [testitem-workflow](https://github.com/julia-testitems/testitem-workflow) repository provides a reusable GitHub Workflow that handles linting, testing across multiple Julia versions and platforms, documentation deployment, and tagging — all in one configuration.

### Quick Start

Add the following file as `.github/workflows/juliaci.yml` to your package:

```yaml
name: Julia CI

on:
  push: {branches: [main, master]}
  pull_request: {types: [opened, synchronize, reopened, ready_for_review, converted_to_draft]}
  issue_comment: {types: [created]}
  workflow_dispatch:
    inputs:
      feature:
        type: choice
        description: What to run
        options: [DocDeploy, LintAndTest, TagBot]

jobs:
  julia-ci:
    uses: julia-testitems/testitem-workflow/.github/workflows/juliaci.yml@v2
    permissions: write-all
    secrets:
      codecov_token: ${{ secrets.CODECOV_TOKEN }}
```

This gives you:
- Linting, with findings shown as inline annotations on the diff
- A format check, which stays inactive until you add a `JuliaFormat.toml` (see [below](#formatting))
- Tests on the release, LTS and smallest compatible Julia versions, plus the current release candidate, run with [`juliati`](./cli)
- The release candidate leg is [allowed to fail](#legs-allowed-to-fail), so a broken RC is reported without failing your CI
- Tests on all supported platforms (Linux, macOS, Windows; x64 and x86/aarch64)
- Coverage upload to Codecov
- A single job summary aggregating test and lint results across the whole matrix
- Documentation deployment
- TagBot automation

For dependency updates, see [Dependabot's Julia support](https://docs.github.com/en/code-security/dependabot).

### Manual Runs

The `workflow_dispatch` block in the quick start above lets you trigger parts of the workflow by hand from the Actions tab. The `feature` choice selects what runs:

| Choice | Runs |
| --- | --- |
| `LintAndTest` | Lint, format check, the test matrix, and the results report |
| `DocDeploy` | Documentation deployment only |
| `TagBot` | TagBot only |

### Jobs

| Job | What it does |
| --- | --- |
| `lint` | Runs the `julia-lint` action and uploads the SARIF for the report job. |
| `format` | Runs the `julia-format` action in check mode with `require-config: true`. |
| `compute-test-matrix` | Derives the version/platform matrix from your `[compat]` bound via [`julia-compute-test-matrix`](./actions#julia-compute-test-matrix). |
| `run-tests` | One leg per matrix entry: installs Julia, builds the package, runs test items with [`julia-run-testitems`](./actions#julia-run-testitems), processes coverage, and uploads to Codecov. Legs [allowed to fail](#legs-allowed-to-fail) run with `continue-on-error`. |
| `report-results` | Merges every leg's results plus the lint SARIF into one job summary via [`julia-report-ci-results`](./actions#julia-report-ci-results). Blocking and allowed-to-fail legs upload separate artifacts, and the report keeps them apart. |
| `deploy-docs` | Runs `julia-docdeploy` if the repository has a docs build. |
| `tagbot` | Runs TagBot on the release comment, or on a manual trigger. |

Because the report job aggregates across the matrix, a test that fails on one platform only is reported once, with the platforms it failed on — you do not have to open 69 job logs to find it. Failures confined to a leg that is allowed to fail are listed under an *(allowed to fail)* heading and marked with a warning rather than an error.

### Formatting

The `format` job is opt-in. It runs with `require-config: true`, so it is a no-op until your repository contains a `JuliaFormat.toml` (or `juliaformat.toml`). Adding an empty one is enough to turn the check on with default settings.

A `.JuliaFormatter.toml` is **not** honored — configuration comes from `JuliaFormat.toml` only.

### Julia Version Matrix

| Option | Default | Description |
|---|---|---|
| `include-release-versions` | `true` | Latest stable Julia version |
| `include-lts-versions` | `true` | Latest long-term support version |
| `include-smallest-compatible-minor-versions` | `true` | Smallest version compatible with `[compat]` |
| `include-all-compatible-minor-versions` | `false` | All compatible minor versions |
| `include-rc-versions` | `true` | Latest release candidate — [allowed to fail](#legs-allowed-to-fail) by default |
| `include-beta-versions` | `false` | Latest beta version |
| `include-alpha-versions` | `false` | Latest alpha version |
| `include-nightly-versions` | `false` | Latest nightly build |

### Platform Matrix

| Option | Default | Description |
|---|---|---|
| `include-linux-x64` | `true` | Linux x64 |
| `include-linux-x86` | `true` | Linux x86 |
| `include-windows-x64` | `true` | Windows x64 |
| `include-windows-x86` | `true` | Windows x86 |
| `include-macos-x64` | `true` | macOS x64 |
| `include-macos-aarch64` | `true` | macOS aarch64 (Apple Silicon) |

### Test Configuration

| Option | Default | Description |
|---|---|---|
| `testitem-timeout` | `1200` | Per-test-item timeout in seconds |
| `filter` | `""` | Julia expression to filter test items (can reference `name`, `tags`, `filename`, `package_name`) |
| `env` | `""` | JSON string of environment variables, e.g. `'{"FOO": "BAR"}'` |
| `github_job_prep_script` | | Path to a Julia script run once per worker before tests |
| `allow-failure` | `"rc,beta,alpha,nightly"` | Which matrix legs may fail without failing the run — see [below](#legs-allowed-to-fail) |

The workflow deliberately exposes only the settings most packages need. The
[`julia-run-testitems` action](./actions#julia-run-testitems) it calls has further
inputs — `junit-path`, `coverage-lcov-path`, `output-mode`, `threads`,
`gc-between-testitems`, `memory-threshold` and `schedule` — which are not forwarded
through the workflow. If you need one of them, use the action directly in a pipeline of
your own; the workflow's [job list](#jobs) is a working description of how the pieces fit
together.

### Legs Allowed to Fail

Some legs are worth running without letting them block a merge — a Julia release candidate,
a nightly build, a platform that is flaky for reasons outside your package. `allow-failure`
says which ones. It takes a comma- or newline-separated list of glob patterns, each matched
against a leg's `<juliaup-channel>:<os>` identity, for example `rc~x64:ubuntu-latest`. Parts
a pattern leaves out are filled in with wildcards, so you write only as much as you mean:

| Pattern | Matches |
|---|---|
| `rc` | every `rc` leg, on every architecture and runner |
| `rc,beta,alpha,nightly` | every pre-release leg — the default |
| `*~x86` | every 32-bit leg, stable ones included |
| `*:macos-26-intel` | every leg on the Intel macOS runner |
| `rc~x64:ubuntu-latest` | that one leg |
| `none` | nothing — every leg blocks |

A matching leg runs with `continue-on-error`. Its failures appear in the job summary under an
*(allowed to fail)* heading with a ⚠️ and are counted separately, and the workflow run stays
green. Note that the leg itself is still shown as **failed** in the checks list — that is how
GitHub renders `continue-on-error`, and it is the intended signal that something needs a look.

A test item that fails on a blocking leg *and* on an allowed one still fails CI.

**Example:** Make release candidates blocking, so a failure on an RC fails your CI:

```yaml
jobs:
  julia-ci:
    uses: julia-testitems/testitem-workflow/.github/workflows/juliaci.yml@v2
    with:
      allow-failure: none
    permissions: write-all
    secrets:
      codecov_token: ${{ secrets.CODECOV_TOKEN }}
```

### Trigger-Specific Overrides

Any option can be overridden for specific triggers by adding a prefix:

| Prefix | Applies when |
|---|---|
| `draft-pr-` | Pull request is in draft state |
| `pr-` | Non-draft pull request |
| `main-` | Push to main/master |
| `manual-trigger-` | Workflow dispatch |

Draft PR and PR prefixes are mutually exclusive — a draft PR only uses `draft-pr-` overrides.

`allow-failure` takes the prefixes too, so you can be strict where it counts and lenient
elsewhere — `pr-allow-failure: none` blocks a PR on every leg while pushes to main stay
tolerant of a broken release candidate.

**Example:** Lightweight CI for draft PRs, full matrix otherwise:

```yaml
jobs:
  julia-ci:
    uses: julia-testitems/testitem-workflow/.github/workflows/juliaci.yml@v2
    with:
      draft-pr-include-lts-versions: false
      draft-pr-include-windows-x64: false
      draft-pr-include-windows-x86: false
      draft-pr-include-linux-x86: false
      draft-pr-include-macos-x64: false
      draft-pr-include-macos-aarch64: false
    permissions: write-all
    secrets:
      codecov_token: ${{ secrets.CODECOV_TOKEN }}
```
