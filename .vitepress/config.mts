import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Julia Test Items',
  description: 'A modern testing framework for Julia',
  cleanUrls: true,

  head: [
    ['link', { rel: 'icon', href: '/favicon.ico' }],
  ],

  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Integrating', link: '/integrating/overview' },
      { text: 'GitHub', link: 'https://github.com/julia-testitems' },
    ],

    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Getting Started', link: '/guide/getting-started' },
          { text: 'Example', link: '/guide/example' },
          { text: 'Writing Tests', link: '/guide/writing-tests' },
          { text: 'Configuration', link: '/guide/configuration' },
          { text: 'VS Code', link: '/guide/vscode' },
          { text: 'REPL', link: '/guide/repl' },
          { text: 'Command Line', link: '/guide/cli' },
          { text: 'Environments', link: '/guide/environments' },
          { text: 'Test Processes', link: '/guide/test-processes' },
          { text: 'Legacy Pkg.test', link: '/guide/pkg-test' },
          { text: 'CI Integration', link: '/guide/ci' },
          { text: 'GitHub Actions', link: '/guide/actions' },
          { text: 'AI Agents (MCP)', link: '/guide/mcp' },
          { text: 'Projects Using Test Items', link: '/guide/users' },
        ],
      },
      {
        text: 'Integrating',
        items: [
          { text: 'Overview', link: '/integrating/overview' },
          { text: 'TestItemRuns.jl API', link: '/integrating/testitemruns' },
          { text: 'JuliaWorkspaces & TestItemControllers', link: '/integrating/julia-apis' },
          { text: 'Language Server Protocol Extension', link: '/integrating/language-server' },
          { text: 'TestItemControllers JSON-RPC', link: '/integrating/jsonrpc' },
          { text: 'Result Formats', link: '/integrating/results' },
        ],
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/julia-testitems' },
    ],

    editLink: {
      pattern: 'https://github.com/julia-testitems/julia-testitems.github.io/edit/main/:path',
      text: 'Edit this page on GitHub',
    },

    search: {
      provider: 'local',
    },

    footer: {
      message: 'Released under the MIT License.',
    },
  },
})
