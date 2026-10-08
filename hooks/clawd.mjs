// Clawd: Claude Code's pixel mascot, at the right end of the Mod Bar toolbar,
// animated with the desktop app's own frames. Idle it looks around; during a
// turn its mood follows what Claude does (thinking, reading, typing at a
// laptop or computer). This module watches the turn and shares it in $.state
// (`clawd.now`); the Mod Bar draws the mascot alone. Without the Mod Bar,
// Clawd draws its own line above the prompt during a turn, with the step.
// It watches tool calls only: no model calls, no tokens.

import { HAS_SPRITES, mascotSvg, mascotText, moodOf } from "./mascot.mjs";

const COLOR = "#d97757"; // Claude orange
const nowRef = { plugin: "clawd", key: "now" };
const barRef = { plugin: "mod-bar", key: "present" };
let ticker = null;

let startedAt = 0;
let steps = 0;
let activity = "";

function fileName(p) {
  const s = String(p ?? "");
  return s.slice(Math.max(s.lastIndexOf("\\"), s.lastIndexOf("/")) + 1) || s;
}

export function elapsed(since, now = Date.now()) {
  const secs = Math.max(0, Math.floor((now - since) / 1000));
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}

/** A short "what it's doing" for a tool call. */
export function describe(e) {
  switch (e.tool) {
    case "Read": return `Reading ${fileName(e.file_path)}`;
    case "Edit":
    case "MultiEdit": return `Editing ${fileName(e.file_path)}`;
    case "Write": return `Writing ${fileName(e.file_path)}`;
    case "NotebookEdit": return `Editing ${fileName(e.notebook_path)}`;
    case "Grep":
    case "Glob": return "Searching files";
    case "PowerShell":
    case "Bash": return e.description ? String(e.description).slice(0, 80) : `Running ${e.tool === "Bash" ? "a shell" : "a PowerShell"} command`;
    case "Agent":
    case "Task": return "Starting a helper agent";
    case "WebFetch":
    case "WebSearch": return "Looking things up online";
    case "Skill": return `Using /${e.skill ?? "a skill"}`;
    case "TodoWrite":
    case "TaskCreate":
    case "TaskUpdate": return "Updating the plan";
    default: return e.tool?.startsWith("mcp__") ? `Using ${e.tool.split("__")[1] ?? "a connector"}` : `Using ${e.tool}`;
  }
}

async function share($) {
  await $.state.set(nowRef, { startedAt, steps, activity }).catch(() => undefined);
  $.ui.invalidate("ui.render");
}

export function register(on) {
  on("session.start", async ($, e, next) => {
    const r = await next(e);
    await share($);
    return r;
  });

  on("turn.start", async ($, e, next) => {
    if (!e.agentId) {
      startedAt = Date.now();
      steps = 0;
      activity = "Thinking…";
      ticker?.cancel();
      // The desktop mascot animates by itself; a redraw is only needed for the
      // terminal's mascot (8 frames a second) and the fallback line's clock.
      const terminal = (await $.session.surfaces().catch(() => [])).includes("terminal");
      const { value: barHere } = await $.state.get(barRef).catch(() => ({ value: false }));
      if (terminal || !barHere) ticker = $.clock.every(terminal ? 125 : 1000, () => $.ui.invalidate("ui.render"));
      await share($);
    }
    return next(e);
  });

  on("tool.call", async ($, e, next) => {
    if (!e.agentId && startedAt) {
      steps += 1;
      activity = describe(e);
      await share($);
    }
    const r = await next(e);
    if (!e.agentId && startedAt) {
      activity = "Thinking…";
      await share($);
    }
    return r;
  }).catch(($, e, next) => next(e));

  on("turn.complete", async ($, e, next) => {
    const r = await next(e);
    if (!e.agentId) {
      startedAt = 0;
      activity = "";
      ticker?.cancel();
      ticker = null;
      await share($);
    }
    return r;
  });

  // Fallback without the Mod Bar: one line at the foot of the band during a turn.
  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    const below = await next(e);
    if (e.props.hasSurvey || !startedAt) return below;
    const { value: barHere } = await $.state.get(barRef).catch(() => ({ value: false }));
    if (barHere) return below;
    const t = $.ui.resolve(e);
    const mood = moodOf(activity, true);
    const meta = [elapsed(startedAt), steps ? `${steps} step${steps === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ");
    const kids = [];
    if (e.surface !== "terminal" && "Svg" in t && HAS_SPRITES) {
      const art = mascotSvg(mood, (Date.now() - startedAt) / 1000);
      kids.push(t.Svg({ key: `clawd-${mood}`, source: art.svg, alt: "Clawd", width: art.width, height: art.height }));
    } else {
      kids.push(t.Text({ key: "clawd-art", color: COLOR, children: mascotText(mood, Math.floor(Date.now() / 400)) }));
    }
    kids.push(t.Text({ key: "clawd-act", wrap: "truncate-end", children: activity || "Thinking…" }));
    kids.push(t.Text({ key: "clawd-meta", dimColor: true, children: meta }));
    const row = t.Box({ key: "clawd", flexDirection: "row", alignItems: "center", gap: 2, children: kids });
    return below ? t.Box({ flexDirection: "column", rowGap: e.surface === "terminal" ? 0 : 1, children: [below, row] }) : row;
  });
}
