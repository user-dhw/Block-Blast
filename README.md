# Block Blast — Grid Burst

A browser-based block puzzle built with React, TypeScript and Vite. The application source lives in [`grid-burst/`](grid-burst/).

**Play:** https://user-dhw.github.io/Block-Blast/

## Local development

Use Node.js 22 LTS, or Node.js 20.19 or newer.

```sh
cd grid-burst
npm ci
npm run dev
```

Open the local address printed by Vite. The game runs entirely in the browser and saves progress locally; no backend, database or API keys are needed.

## Validation

Run these commands inside `grid-burst/`:

```sh
npm run lint
npm run test
npm run build
```

## Automatic deployment

The root workflow [`.github/workflows/grid-burst-pages.yml`](.github/workflows/grid-burst-pages.yml) runs on every push to `main` and can also be started manually from the repository's Actions tab. It installs dependencies, runs lint and tests, builds the application with the GitHub Pages base path, then deploys the resulting static site.

The repository's **Settings → Pages → Build and deployment → Source** must be set to **GitHub Actions**. Deployment progress and failures are reported in the [Actions tab](https://github.com/user-dhw/Block-Blast/actions).

See the [application README](grid-burst/README.md) for game rules, architecture and customization.
