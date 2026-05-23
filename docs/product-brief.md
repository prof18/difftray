# Product Brief

## Summary

Difftray is a local-first macOS app for reviewing Git diffs across multiple projects. It lets a developer mark files as reviewed, keeps those marks across app restarts, and automatically clears them when a file's diff changes.

## Target User

The initial target user is a developer reviewing local changes produced by themselves or by coding agents before committing, pushing, or opening a pull request.

The app should eventually be useful to other developers, but v0 optimizes for a single local user.

## Problem

Local review workflows break down when many files change across multiple repos or worktrees. Standard diff viewers show what changed, but they do not reliably answer:

- Which files did I already review?
- Did anything change after I reviewed it?
- Which project still needs attention?
- Can I continue review later without reconstructing state from memory?

## Non-Goals

- Code editing inside the app.
- Running AI agents.
- Hosting pull requests.
- Syncing review state across machines or teams.
- GitHub/GitLab integration in v0.
- Non-Git folder support in v0.
- Merge conflict resolution.

## Product Thesis

The diff viewer is not the moat. The moat is durable, trustworthy review state.

If Difftray says a file is reviewed, that must mean the exact diff currently shown to the user matches the diff that was reviewed.

## Primary Workflow

1. Open one or more local Git projects or worktrees.
2. Select a project from the sidebar.
3. Difftray chooses a default comparison:
   - show working tree changes if present
   - otherwise show branch changes against the configured base
   - otherwise show no changes
4. Review changed files one by one in side-by-side diff mode.
5. Mark a file as reviewed.
6. Difftray collapses the reviewed file and advances to the next unreviewed file.
7. If the file changes later, Difftray clears the reviewed state.

## Success Criteria

- The user can keep one window open for multiple active projects.
- The user can see review progress per project.
- Reviewed state is never stale.
- Review can be driven mostly from the keyboard.
- The app remains fast and stable on medium-sized repos.
