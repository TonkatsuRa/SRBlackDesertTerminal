# Black Desert Research Terminal

Static retro sci-fi terminal project for GitHub Pages.

## How To Edit

- Main page structure: `index.html`
- Styles: `css/`
- App behavior: `js/`
- Editable terminal text: `content/terminal-content.md`
- Database packages: `databases/`
- Tactical Facility map: `facility-map.html`

The project uses plain HTML, CSS, and vanilla JavaScript. There is no npm, Vite, React, TypeScript, or build step.

## How To Preview

For the most reliable local preview, use a small local web server from this folder. Opening `index.html` directly can work for the page shell, but browser security may block `fetch()` requests for files like `content/terminal-content.md` and `databases/manifest.json`.

If you do open the file directly and database loading is blocked, use the in-terminal local file picker to select database files manually.

The Facility Status map uses an iframe and loads `facility-map.html`. Preview the full terminal over HTTP when testing databases/content because `fetch()` can be blocked under `file://`.

## GitHub Pages

Upload or publish the project root so `index.html` is at the published root. Keep the existing `.nojekyll` file so GitHub Pages serves Markdown database files as raw files.

All active paths are relative, for example:

```text
css/base.css
js/main.js
facility-map.html
content/terminal-content.md
databases/manifest.json
```

## V3 Facility Map

Facility Status now switches to a fullscreen black loading screen, then lazy-loads the Black Desert tactical map in an iframe. The top-right `[ BACK TO TERMINAL ]` button removes the iframe so the Three.js/WebGL runtime is unloaded while the main terminal state stays in memory.

Keep `V1 Black Desert Tactical Map.html` as source material. The deployed map path is `facility-map.html`.

## Encrypted ZIP Database Packages

Database packages can also be uploaded as password-protected `.zip` files. The ZIP password is an internal transport key stored in `js/database.js` in obfuscated hex form; it is separate from the in-terminal database password stored inside the extracted Markdown file. This hides spoilers from casual file browsing, but it is not real security against someone inspecting the JavaScript source.

Example manifest entry:

```json
{
  "id": "sealed-archive",
  "displayName": "Sealed Archive",
  "description": "Encrypted database package.",
  "file": "sealed-archive.zip",
  "format": "zip",
  "innerFile": "sealed-archive.md"
}
```

The ZIP should contain one `.md`, `.markdown`, or `.txt` database file using the same format as the existing files in `databases/`.

## Notes For Future Changes

- Keep the app static and GitHub Pages compatible.
- Keep `databases/` unchanged until the database/search overhaul phase.
- Split files by responsibility, but preserve existing DOM IDs and class names unless a later fix requires changing them.
