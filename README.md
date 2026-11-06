# Scott Free

A calm personal life hub. Plain HTML, CSS and JavaScript, hosted on GitHub Pages, with Supabase behind it.

This repo is public. Only the Supabase URL and anon key may ever be committed. All other secrets live in Supabase.

## Folders
- `index.html`, `config.js` (app name, Supabase keys), `registry.js` (list of hubs and tiles)
- `core/`: app shell, sign-in, grid, theme
- `hubs/<id>/`: one folder per hub
- `tiles/<id>/`: one folder per tile
- `supabase/schema.sql`: database tables and security rules
- `docs/SUPABASE-SETUP.md`: one-off setup guide

## Deploying
GitHub **Settings > Pages**: Source "Deploy from a branch", branch `main`, folder `/ (root)`. Changes go live a minute or two after each commit.

## Adding a tile or hub
Copy an existing folder in `tiles/` or `hubs/`, rename it, and add one line to `registry.js`.

A full guide follows in the final build phase.
