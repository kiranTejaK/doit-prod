# DOit Project - Frontend

The frontend is built with [Vite](https://vitejs.dev/), [React](https://reactjs.org/), [TypeScript](https://www.typescriptlang.org/), [TanStack Query](https://tanstack.com/query) and [TanStack Router](https://tanstack.com/router).

## Frontend development

Before you begin, ensure that you have Node.js installed (v20+ recommended).

1. Navigate to the `frontend` directory:

```bash
cd frontend
```

2. Install the necessary NPM packages:

```bash
npm install
```

3. Start the live development server:

```bash
npm run dev
```

4. Open your browser at http://localhost:5173/.

Notice that this live server is not running inside Docker; it's for local development, which is the recommended workflow. Ensure your backend is running locally (e.g., via `docker compose up -d` from the root directory) so the frontend can interact with the API.

### Quality Checks

You can run the Biome linter and TypeScript compiler checks to ensure your code is ready for production:

```bash
# Run Biome linter
npm run lint

# Run a build check (TypeScript + Vite)
npm run build
```

These checks also run automatically via GitHub Actions upon pushing to the `main` branch.

## Using a Remote API

If you want to use a remote API during local development, you can set the environment variable `VITE_API_URL` to the URL of the remote API. Create or edit the `frontend/.env` file:

```env
VITE_API_URL=https://api.my-domain.example.com
```

Then, when you run the frontend, it will use that URL as the base URL for the API.

## Code Structure

The frontend code is structured as follows:

* `src/` - The main frontend code.
* `src/assets/` - Static assets.
* `src/client/` - The OpenAPI client for interacting with the backend.
* `src/components/` -  The different UI components.
* `src/hooks/` - Custom React hooks.
* `src/routes/` - The different routes of the frontend which include the pages.

## End-to-End Testing with Playwright

The frontend includes initial end-to-end tests using Playwright. To run the tests, you need to have the Docker Compose stack running. Start the stack from the root directory:

```bash
docker compose up -d --wait backend
```

Then, from the `frontend` directory, you can run the tests:

```bash
npx playwright test
```

You can also run your tests in UI mode:

```bash
npx playwright test --ui
```
