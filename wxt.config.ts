import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'FocusLens',
    description: 'Private, local-first insight into your browsing habits.',
    version: '0.1.0',
    minimum_chrome_version: '116',
    permissions: ['storage', 'tabs', 'idle', 'alarms'],
    incognito: 'not_allowed',
    action: {
      default_title: 'FocusLens',
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
