<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Pull request previews

After creating a pull request, start an isolated local preview from the pull
request branch in a dedicated worktree and on an unused port. Open the exact
feature-specific test URL in the macOS default browser and leave the server
running for the user.

The preview must be usable without Google OAuth. Prefer a guest-accessible route
with representative test data. When the feature normally requires an account,
add a deterministic development-only fixture or preview route that exercises
the signed-in state without changing or bypassing production authorization.

Include the preview URL and what data or state it demonstrates in the handoff.

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
