# Decision 0013: Storage SQLite Runtime

## Status

Accepted

## Decision

Use Node's built-in `node:sqlite` `DatabaseSync` API for the initial storage layer.

## Context

Difftray needs local SQLite persistence for projects, review targets, settings, and review marks. The current runtime exposes `node:sqlite`, which avoids adding a native npm SQLite module during the early Electron scaffold.

## Consequences

Positive:

- No additional native dependency or postinstall build step.
- Storage tests can use deterministic in-memory databases.
- The main-process storage boundary remains small and easy to replace later.

Negative:

- Electron runtime compatibility must be verified before packaging.
- If `node:sqlite` support becomes insufficient, the storage adapter may need to move to a bundled native or WASM SQLite dependency.
