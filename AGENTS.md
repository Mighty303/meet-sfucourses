<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Comments

A `/** … */` docstring on a declaration — module, function, type, interface,
prop — has no length limit. Explaining why a thing exists is what it's for, and
that is often a paragraph.

**Every other comment is capped at three lines.** A run of `//` inside a
function body, a `/* … */` note between JSX elements, the line above a tricky
expression: three lines or fewer.

Needing a fourth line means the explanation is in the wrong place. Move it into
the docstring of the thing it's about, or split the code so each piece can be
explained where it stands.
