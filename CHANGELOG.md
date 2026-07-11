# Changelog

## 0.0.7 - 2026-07-11

### Improved

- Improved review-workflow reliability and internal foundations.

## 0.0.6 - 2026-06-27

### Added

- Check for app updates from the native menu bar in production builds.

## 0.0.5 - 2026-06-27

### Added

- Reorder open project tabs by dragging; tabs rearrange live as you drag.
- Remember project tab order across app restarts.

## 0.0.4 - 2026-06-08

### Added

- Check for app updates once per day while Difftray remains open.
- Added a manual update check action to the review toolbar.

### Fixed

- Kept downloaded updates ready to install even if a later automatic check runs.
- Show update-check errors instead of reporting the app as up to date when the
  updater cannot be loaded.

## 0.0.3 - 2026-06-08

### Fixed

- Improved file-list sizing in narrow panes so diff targets remain readable and
  aligned during local review.

## 0.0.2 - 2026-06-07

### Added

- Review a single commit, branch changes, or current working-tree changes from
  the same review flow.
- Pick what you want to review from a clearer selector with Git changes, branch,
  and recent commit choices.
- Open the selected file in the system default editor or a detected editor
  preset.

### Improved

- Reviewing large diffs feels faster and smoother, especially while selecting
  files, marking files reviewed, and saving comments.
- Copying review comments now shows when the report is being prepared, avoiding
  duplicate copy actions.
- Release downloads are smaller.
- The README now explains installation, key workflows, and release downloads
  more clearly.

### Fixed

- New empty Git repositories now load more reliably.
- Error banners can be dismissed.
- The app is stricter about trusted windows, navigation, and renderer messages.
