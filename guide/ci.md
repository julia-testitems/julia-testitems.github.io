# CI Integration

The test item framework provides GitHub Actions integration for running tests in CI.

## Reusable Workflow (Recommended)

The [testitem-workflow](https://github.com/julia-testitems/testitem-workflow) repository provides a reusable GitHub Workflow that handles linting, testing across multiple Julia versions and platforms, documentation deployment, compatibility updates, and tagging — all in one configuration.

### Quick Start

Add the following file as `.github/workflows/juliaci.yml` to your package:

```yaml
name: Julia CI

on:
  push: {branches: [main, master]}
  pull_request: {types: [opened, synchronize, reopened, ready_for_review, converted_to_draft]}
  issue_comment: {types: [created]}
  schedule: [{cron: '0 0 * * *'}]
  workflow_dispatch:
    inputs:
      feature:
        type: choice
        description: What to run
        options: [CompatHelper, DocDeploy, LintAndTest, TagBot]

jobs:
  julia-ci:
    uses: julia-testitems/testitem-workflow/.github/workflows/juliaci.yml@v1
    permissions: write-all
    secrets:
      codecov_token: ${{ secrets.CODECOV_TOKEN }}
```

This gives you:
- Tests on release + LTS Julia versions
- Tests on all supported platforms (Linux, macOS, Windows; x64 and x86/aarch64)
- Documentation deployment
- CompatHelper and TagBot automation

### Julia Version Matrix

| Option | Default | Description |
|---|---|---|
| `include-release-versions` | `true` | Latest stable Julia version |
| `include-lts-versions` | `true` | Latest long-term support version |
| `include-smallest-compatible-minor-versions` | `true` | Smallest version compatible with `[compat]` |
| `include-all-compatible-minor-versions` | `false` | All compatible minor versions |
| `include-rc-versions` | `false` | Latest release candidate |
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

### Trigger-Specific Overrides

Any option can be overridden for specific triggers by adding a prefix:

| Prefix | Applies when |
|---|---|
| `draft-pr-` | Pull request is in draft state |
| `pr-` | Non-draft pull request |
| `main-` | Push to main/master |
| `manual-trigger-` | Workflow dispatch |

Draft PR and PR prefixes are mutually exclusive — a draft PR only uses `draft-pr-` overrides.

**Example:** Lightweight CI for draft PRs, full matrix otherwise:

```yaml
jobs:
  julia-ci:
    uses: julia-testitems/testitem-workflow/.github/workflows/juliaci.yml@v1
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

**Example:** Include release candidates:

```yaml
jobs:
  julia-ci:
    uses: julia-testitems/testitem-workflow/.github/workflows/juliaci.yml@v1
    with:
      include-rc-versions: true
    permissions: write-all
    secrets:
      codecov_token: ${{ secrets.CODECOV_TOKEN }}
```


