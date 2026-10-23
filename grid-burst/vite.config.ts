import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const repository = process.env.GITHUB_REPOSITORY?.split('/')[1];
const pagesBase = process.env.PAGES_BASE_PATH ?? (repository && !repository.endsWith('.github.io') ? `/${repository}/` : './');

export default defineConfig({ plugins: [react()], base: pagesBase });
