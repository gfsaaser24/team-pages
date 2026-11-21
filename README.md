# Team Pages

A shared workspace for your team: nested pages built from blocks, databases with table, board, calendar and list views, sharing by permission level, comments, version history and read-only web links.

Inspired by https://notion.so

Built with [oss.new](https://oss.new) for [EveryApp](https://github.com/every-app/every-app).

## Features

- Write nested pages with an icon and blocks: text, headings, lists, to-dos, quotes, code, dividers, sub-pages, images and files.
- Turn a page into a database with typed properties and saved table, board, calendar and list views, each with its own filters and sorts.
- Share a page with members or the whole workspace at Full access, Can edit, Can comment or Can view.
- Comment on a page or a block, then resolve, reopen or delete comments.
- Browse 30 days of page versions, preview one and restore it.
- Publish a page and its sub-pages to a read-only link, with an optional expiry.
- Search titles and text across every page you can open.

Left out: accounts and sign-in, which your Gateway handles; AI features; live co-editing; forms, calendar and mail add-ons; custom domains; automations, formulas and relations; integrations and importers; teamspaces and templates; enterprise admin and billing; desktop and mobile apps.

## Setup

```sh
pnpm install
pnpm dev          # run locally behind the local Gateway
pnpm test         # unit tests
pnpm run deploy   # deploy to your Cloudflare account through your Gateway
```

The app needs no secrets or settings. It uses a D1 database and an R2 bucket (`files`) for attachments; the deploy creates both.

The checks in `checks/` run against a packaged release with the EveryApp runtime; they were not run against a live deployment.

## Limitations

- Attachments are limited to 5 MB each.
- Two people editing the same page at once don't merge: the later save is refused and that person reloads.
- A member appears in the share dialog and person properties after they have opened the app once.
- Published links show the page as it is now, read-only; they have no custom domain or styling.
