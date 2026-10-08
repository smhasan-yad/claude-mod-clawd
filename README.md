# claude-mod-clawd

Claude's pixel mascot, animated, at the right of the Mod Bar: looks around while idle, thinks, types at a laptop while Claude edits or runs commands. Zero tokens. Needs the sprite file (see below) for the animated version; otherwise a block-character crab is shown.

## Install

```bash
claude plugin marketplace add smhasan-yad/claude-mod-clawd
claude plugin install clawd@claude-mod-clawd
```

A new chat or /reload-plugins picks it up. Written for the Windows desktop app and terminal (Claude Code mods API); not tested elsewhere.

## Clawd sprites

The animation uses Clawd frames from the Claude desktop app (c) Anthropic. Those frames are **not** in this repo: `hooks/clawd-sprites.mjs` is an empty stub, so out of the box you get a block-character crab.

For the animated mascot, run this once after installing (it reads your own installed Claude desktop app, read-only, no dependencies):

```bash
node tools/extract-clawd-sprites.mjs
```

It writes `hooks/clawd-sprites.mjs` locally. Pass `--asar <path>` if it can't find the app, and `--out <file>` to write elsewhere. Don't commit the generated file. If you installed from the marketplace, run it from the plugin's cache folder (`~/.claude/plugins/cache/...`) or clone the repo and install from the clone. Re-run after the app updates if the mascot changes.

## License

MIT. 
