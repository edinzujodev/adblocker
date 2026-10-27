# @jok/api

TypeScript client and types for the JoK JSON API, shared by the web
app (`web/`) and the mobile app (`mobile/`). It has no dependencies and only
uses `fetch`, so it runs in browsers and in React Native.

Both apps import it as `@jok/api` through a path alias (see their
`tsconfig` and bundler config); it is not an npm package.
