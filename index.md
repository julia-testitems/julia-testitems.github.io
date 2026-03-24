---
layout: home

hero:
  name: Julia Test Items
  text: A modern testing framework for Julia
  tagline: Write standalone test items, run them anywhere — VS Code, REPL, command line, or CI.
  image:
    src: /images/vscode-main.png
    alt: VS Code with test items, inline results, and code coverage
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/julia-testitems

features:
  - title: Standalone Test Items
    details: Structure tests into independent <code>@testitem</code> blocks that can be run individually. No more running your entire test suite to check one thing.
  - title: Run Anywhere
    details: The same tests work in VS Code, the REPL, on the command line, and in GitHub Actions CI — no changes needed.
  - title: Parallel Execution
    details: Test items run in parallel across multiple worker processes, with automatic process management and configurable concurrency.
  - title: Code Coverage & Debugging
    details: Run tests with code coverage on Julia 1.11+, or step through them in the VS Code debugger with full breakpoint support.
---

<style>
.showcase {
  max-width: 1152px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
}

.showcase-section {
  display: flex;
  align-items: center;
  gap: 3rem;
  margin: 4rem 0;
}

.showcase-section.reverse {
  flex-direction: row-reverse;
}

.showcase-text {
  flex: 1;
  min-width: 280px;
}

.showcase-text h2 {
  font-size: 1.6rem;
  font-weight: 700;
  margin-bottom: 0.75rem;
  background: linear-gradient(120deg, var(--vp-c-brand-1), var(--vp-c-brand-2, var(--vp-c-brand-1)));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.showcase-text p {
  font-size: 1.05rem;
  line-height: 1.7;
  color: var(--vp-c-text-2);
}

.showcase-image {
  flex: 1.5;
  min-width: 0;
}

.showcase-image img {
  width: 100%;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
  border: 1px solid var(--vp-c-divider);
}

.dark .showcase-image img {
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.code-example {
  max-width: 720px;
  margin: 4rem auto;
  text-align: center;
}

.code-example h2 {
  font-size: 1.6rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
}

.code-example p {
  color: var(--vp-c-text-2);
  margin-bottom: 1.5rem;
  font-size: 1.05rem;
}

.ecosystem {
  max-width: 720px;
  margin: 2rem auto 4rem;
  text-align: center;
}

.ecosystem h2 {
  font-size: 1.6rem;
  font-weight: 700;
  margin-bottom: 1rem;
}

.ecosystem ul {
  list-style: none;
  padding: 0;
  text-align: left;
  display: inline-block;
}

.ecosystem li {
  padding: 0.4rem 0;
  font-size: 1.05rem;
}

@media (max-width: 768px) {
  .showcase-section,
  .showcase-section.reverse {
    flex-direction: column;
  }
}
</style>

<div class="showcase">

<div class="showcase-section">
  <div class="showcase-text">
    <h2>Rich VS Code Integration</h2>
    <p>
      Discover test items automatically as you type. Run them individually with a click and see results inline — failed assertions show expected vs. actual values right in the editor. Line-level code coverage highlights which code paths your tests exercise.
    </p>
  </div>
  <div class="showcase-image">
    <img src="/images/vscode-main.png" alt="VS Code showing test explorer, inline test failure diffs, and line-level code coverage annotations">
  </div>
</div>

<div class="showcase-section reverse">
  <div class="showcase-text">
    <h2>Interactive REPL Runner</h2>
    <p>
      Run test items directly from the Julia REPL with an interactive interface. Filter by name or tag, see live progress, and inspect results — all without leaving the terminal. <em>(Prerelease)</em>
    </p>
  </div>
  <div class="showcase-image">
    <img src="/images/repl-main.png" alt="Julia REPL running test items interactively with live progress and results">
  </div>
</div>

<div class="showcase-section">
  <div class="showcase-text">
    <h2>Batteries-Included CI</h2>
    <p>
      A single reusable workflow gives you linting, testing across a full Julia version and platform matrix, documentation deployment, CompatHelper, and TagBot — all configured in one YAML file.
    </p>
  </div>
  <div class="showcase-image">
    <img src="/images/github-action.png" alt="GitHub Actions workflow showing lint, test matrix, report results, and automation stages">
  </div>
</div>

</div>

<div class="code-example">

## Simple to Write

Define independent test items anywhere in your package. Each one is self-contained and runnable on its own.

```julia
@testitem "CSV parsing" tags=[:parser] begin
    data = parsecsv("name,age\nAlice,30\nBob,25")

    @test length(data) == 2
    @test data[1].name == "Alice"
    @test data[2].age == 25
end
```

</div>

<div class="ecosystem">

## The Test Item Ecosystem

- [**TestItems.jl**](https://github.com/julia-testitems/TestItems.jl) — The core `@testitem`, `@testmodule`, and `@testsnippet` macros.
- [**Julia VS Code Extension**](https://www.julia-vscode.org/) — Rich editor integration with inline results, debugging, and coverage.
- [**TestItemRunner.jl**](https://github.com/julia-vscode/TestItemRunner.jl) — Run test items from the command line via `Pkg.test`.
- [**TestItemREPL.jl**](https://github.com/julia-vscode/TestItemREPL.jl) — Interactive REPL runner with live progress and result inspection. *(Prerelease)*
- [**testitem-workflow**](https://github.com/julia-testitems/testitem-workflow) — Reusable GitHub Workflow for CI with version matrix support.

</div>

<div style="text-align: center; margin-bottom: 4rem;">
  <a href="/guide/getting-started" style="display: inline-block; padding: 0.75rem 2rem; background: var(--vp-c-brand-1); color: var(--vp-c-white); border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 1.1rem;">Read the Guide →</a>
</div>
