import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'FocusLens',
    description: 'Private, local-first insight into your browsing habits.',
    version: '0.1.0',
    minimum_chrome_version: '116',
    // `idle` must be a required permission: the background worker calls
    // browser.idle on every sync, and nothing requests it at runtime.
    permissions: ['storage', 'tabs', 'alarms', 'idle'],
    optional_host_permissions: ['https://*/*', 'http://localhost/*', 'http://127.0.0.1/*'],
    host_permissions: ['https://youtube.com/*', 'https://www.youtube.com/*'],
    optional_permissions: ['notifications'],
    incognito: 'not_allowed',
    action: {
      default_title: 'FocusLens',
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
