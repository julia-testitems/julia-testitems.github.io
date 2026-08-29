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
  push: {branches: [main, master], tags: ['**']}
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
- Documentation deployment, including [versioned docs for every release tag](#versioned-documentation) — no `DOCUMENTER_KEY` needed
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
| `deploy-docs` | Runs `julia-docdeploy` if the repository has a docs build. Runs for branch pushes, pull requests, and `v*` tag pushes. |
| `tagbot` | Runs TagBot on the release comment, or on a manual trigger. |
| `deploy-tagged-docs` | Deploys the versioned docs for the tags TagBot just created, in the same run — see [Versioned Documentation](#versioned-documentation). |

Because the report job aggregates across the matrix, a test that fails on one platform only is reported once, with the platforms it failed on — you do not have to open 69 job logs to find it. Failures confined to a leg that is allowed to fail are listed under an *(allowed to fail)* heading and marked with a warning rather than an error.

### Versioned Documentation

Documenter deploys the docs for a release from a build of its `v*` tag, and the workflow covers both ways such a tag comes into being — without a `DOCUMENTER_KEY` deploy key:

- **Tags created by TagBot** (the normal registry release flow): tags pushed with the workflow's `GITHUB_TOKEN` never trigger another workflow run, so a `tags:` trigger cannot fire for them. Instead, the run that executes TagBot detects the tags it created and deploys their docs directly, in the same run.
- **Tags pushed by hand**: the `tags: ['**']` trigger in the quick start fires, and the docs for the tag are deployed. A tag push runs *only* docs deployment — the tagged commit already went through lint and tests on its branch, so the test matrix is not repeated.

The trigger is deliberately every tag (`'**'`) while the workflow only acts on tags starting with `v`: future tag-driven features can be added to the reusable workflow without you having to touch your workflow file again. To redeploy a version's docs by hand, run the `DocDeploy` [manual trigger](#manual-runs) with the tag selected as the ref.

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
| `testitem-timeout` | *(none)* | Per-test-item timeout in seconds. Unset by default — see [Hang diagnostics](./test-processes#hang-diagnostics) |
| `activation-timeout` | *(none)* | How long a test process may spend activating and precompiling its environment before its items are errored. Unset by default — a legitimate activation is a precompilation. |
| `run-stall` | *(off)* | Opt-in: error the run's remaining items after this many seconds with no test process busy and no message about it. Unset never fails an idle run — it is only warned about in the log. Time in which a worker is activating, revising or running an item never counts. |
| `filter` | `""` | Julia expression to filter test items (can reference `name`, `tags`, `filename`, `package_name`) |
| `env` | `""` | JSON string of environment variables, e.g. `'{"FOO": "BAR"}'` |
| `github_job_prep_script` | | Path to a Julia script run once per worker before tests |
| `allow-failure` | `"rc,beta,alpha,nightly"` | Which matrix legs may fail without failing the run — see [below](#legs-allowed-to-fail) |
| `max-workers` | the `juliati` default | Maximum number of parallel test processes per leg. |
| `threads` | Julia's own default | Value for the test processes' `--threads`, e.g. `4`, `auto`, `2,1`. |
| `gc-between-testitems` | the `juliati` default | Run a full GC between test items: `true`, `false`, or unset for the default (on when more than one test process is used). See [Test Processes](./test-processes#gc-between-test-items). |
| `memory-threshold` | off | Recycle a test process once system memory use exceeds this fraction (0–1). Experimental. See [Test Processes](./test-processes#memory-threshold-recycling). |
| `schedule` | the `juliati` default | How test items are distributed over test processes: `duration` (the default) or `contiguous`. See [Test Processes](./test-processes#scheduling). |
| `coverage` | `true` | Run the test processes in coverage mode and upload the merged result. |
| `coverage-lcov-path` | — | Path to write the merged coverage of the run in LCOV format. |
| `junit-path` | — | Path to write the test-run results as JUnit XML. |
| `output-mode` | the action default (`issues`) | Which captured test item output to echo into the job log: `issues`, `all`, or `none`. |
| `test-log-level` | `Info` | Minimum log level for the code under test: `Debug`, `Info`, `Warn` or `Error`. |
| `check-bounds` | `auto` | `--check-bounds` mode for the test processes. `auto` respects `@inbounds` and reuses precompile caches; `yes` forces bounds checks everywhere, matching `Pkg.test`, at the cost of re-precompiling every leg. |

These forward directly to the [`julia-run-testitems` action](./actions#julia-run-testitems)
the workflow calls; its input table has the full descriptions. The workflow's
[job list](#jobs) is a working description of how the pieces fit together.

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
