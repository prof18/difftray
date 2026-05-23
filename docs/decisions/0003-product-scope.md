# Decision 0003: Product Scope

## Status

Accepted

## Decision

Difftray is a local diff review tracker. It is not an IDE, merge tool, AI agent runner, or pull request platform.

V0 supports file-level review only.

## Context

The app exists to make local code review manageable across multiple projects, especially when changes may continue to arrive while review is in progress.

Adding editing, agent execution, PR integrations, or line comments too early would pull the product away from its core behavior.

## Consequences

Positive:

- Clear MVP.
- Smaller implementation surface.
- Easier to test.
- Stronger product identity.

Negative:

- Some users may expect editing or comments.
- Future features need disciplined prioritization.

## Future Expansion

Line comments and agent-ready comment export are explicitly allowed later, after file-level review is solid.
