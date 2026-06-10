# 0031 Landing Page Custom Domain

Date: 2026-06-10

## Status

Accepted

## Context

Difftray publishes a static landing page from `site/` with a GitHub Actions
Pages workflow. The repository Pages deployment failed until GitHub Pages was
enabled with the GitHub Actions publishing source.

The public landing page should use the product domain instead of the repository
project URL.

## Decision

The landing page canonical domain is `difftray.app`.

GitHub Pages is configured for `prof18/difftray` with the `workflow` build type
and the custom domain `difftray.app`. The static artifact includes
`site/CNAME` and social preview URLs point at `https://difftray.app/`.

DNS should be managed in Cloudflare and point the apex domain to GitHub Pages.
The `www` subdomain should point to `prof18.github.io` so GitHub Pages can
redirect it to the apex domain.

## Consequences

- The Pages deployment workflow can publish from the `site/` artifact.
- DNS must keep GitHub Pages apex records in place for certificate provisioning
  and HTTPS enforcement.
- HTTPS enforcement can only be enabled after DNS is visible to GitHub and the
  Pages certificate has been issued.
