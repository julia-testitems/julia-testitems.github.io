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
      { text: 'GitHub', link: 'https://github.com/julia-testitems' },
    ],

    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Getting Started', link: '/guide/getting-started' },
          { text: 'Writing Tests', link: '/guide/writing-tests' },
          { text: 'VS Code', link: '/guide/vscode' },
          { text: 'REPL', link: '/guide/repl' },
          { text: 'Command Line', link: '/guide/cli' },
          { text: 'CI Integration', link: '/guide/ci' },
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
