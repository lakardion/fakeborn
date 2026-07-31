/**
 * Playground client runtime (framework-free).
 *
 * Loaded only on /playground: Playground.astro references this module from a
 * processed <script>, and Astro bundles it into that page's script chunk.
 * The heavy pieces load even later:
 *  - CodeMirror mounts via dynamic import() so it doesn't block first paint;
 *  - zod/valibot/fakeborn are NEVER imported here — the sandboxed iframe
 *    fetches them as static pre-bundled assets (built by
 *    scripts/build-playground-runtime.ts) through an import map.
 *
 * Execution follows the Valibot playground pattern (source-verified in
 * docs/research/starlight-playground-integration.md): sucrase strips types,
 * the code is postMessage'd to a sandbox="allow-scripts" iframe, and the
 * iframe injects it as a <script type="module">. The harness wraps
 * console.* / window.onerror and posts results back.
 */
import { transform } from "sucrase";
import type { EditorView } from "codemirror";
import { PRESETS, PRESET_SECTIONS, type Preset } from "./presets";

/** Static runtime bundles consumed by the iframe import map (root-absolute). */
const SITE_BASE = import.meta.env.BASE_URL.endsWith("/")
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`;
const RUNTIME_BASE = `${SITE_BASE}playground-runtime`;

const AUTORUN_DELAY_MS = 500;

/** Messages the iframe harness posts back to this page. */
type RunnerMessage =
  | { type: "ready" }
  | { type: "result"; id: number; json: string }
  | { type: "error"; id: number; name: string; message: string }
  | { type: "log"; level: "log" | "warn" | "error"; text: string };

/**
 * The iframe document. The import map resolves bare specifiers in user code
 * to the pre-bundled runtimes; the harness module forwards console output and
 * errors to the parent and executes incoming code. Every run is a fresh
 * module script, so top-level `const schema` never collides across runs.
 *
 * The import map targets are data: URLs, not asset URLs: the sandboxed iframe
 * has an opaque origin, so module-script fetches (always CORS mode) of even
 * same-origin URLs fail — GitHub Pages can't send Access-Control-Allow-Origin
 * to save them. The parent fetches the bundles (same-origin, cached) and
 * inlines them; module imports of data: URLs need no network at all.
 *
 * Kept as a plain string (not TS) — it executes inside the iframe, where
 * none of this module's scope exists.
 */
function runnerSrcdoc(bundles: Record<RuntimeName, string>): string {
  const importMap = JSON.stringify({
    imports: Object.fromEntries(
      Object.entries(bundles).map(([name, code]) => [
        name,
        `data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`,
      ]),
    ),
  });
  // NOTE: no `${}` or "</script>" inside the harness — it's interpolated into
  // the srcdoc template below.
  const harness = `
const send = (m) => parent.postMessage(m, "*");
for (const level of ["log", "warn", "error"]) {
  const orig = console[level];
  console[level] = (...args) => {
    send({ type: "log", level, text: args.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ") });
    orig(...args);
  };
}
let currentRunId = 0;
const asError = (err, fallback) => ({
  type: "error",
  id: currentRunId,
  name: err?.name ?? fallback,
  message: String(err?.message ?? err),
});
window.addEventListener("error", (e) => send({ ...asError(e.error, "Error"), message: String(e.error?.message ?? e.message) }));
window.addEventListener("unhandledrejection", (e) => send(asError(e.reason, "UnhandledRejection")));
const replacer = (_key, value) => (typeof value === "bigint" ? value.toString() + "n" : value);
window.addEventListener("message", (e) => {
  if (!e.data || e.data.type !== "run") return;
  const { id, code, options } = e.data;
  currentRunId = id;
  // The harness owns fake() so the toolbar options always apply; user code
  // only declares a top-level \`schema\`.
  globalThis.__run = async (schema) => {
    try {
      const { fake } = await import("fakeborn");
      send({ type: "result", id, json: JSON.stringify(fake(schema, options), replacer, 2) });
    } catch (err) {
      send({ type: "error", id, name: err?.name ?? "Error", message: String(err?.message ?? err) });
    }
  };
  const script = document.createElement("script");
  script.type = "module";
  script.textContent = code + "\\n;globalThis.__run(schema);";
  document.body.appendChild(script);
});
send({ type: "ready" });
`;
  return `<!doctype html><html><head><script type="importmap">${importMap}</script></head><body><script type="module">${harness}</script></body></html>`;
}

type RuntimeName = "zod" | "valibot" | "fakeborn";
const RUNTIME_NAMES: RuntimeName[] = ["zod", "valibot", "fakeborn"];

/** Numeric input value, or undefined when empty/invalid. */
function num(input: HTMLInputElement): number | undefined {
  return Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : undefined;
}

/** Starlight's theme attribute; dark is the site's default. */
function isDark(): boolean {
  return document.documentElement.dataset.theme !== "light";
}

/** Which validator library a snippet belongs to, read off its import. */
function codeLibrary(code: string): "zod" | "valibot" | undefined {
  const match = /from\s+["'](zod|valibot)["']/.exec(code);
  return match?.[1] as "zod" | "valibot" | undefined;
}

/** Fetch the pre-bundled runtimes (same-origin, cacheable) for inlining into
 * the iframe import map as data: URLs — see runnerSrcdoc for why. */
async function fetchRuntimeBundles(): Promise<Record<RuntimeName, string>> {
  const texts = await Promise.all(
    RUNTIME_NAMES.map((name) =>
      fetch(`${RUNTIME_BASE}/${name}.js`).then((res) => {
        if (!res.ok) throw new Error(`playground runtime ${name}.js: HTTP ${res.status}`);
        return res.text();
      }),
    ),
  );
  return Object.fromEntries(RUNTIME_NAMES.map((name, i) => [name, texts[i]])) as Record<
    RuntimeName,
    string
  >;
}

/** The UI contract Playground.astro's markup provides. */
function queryEls(root: HTMLElement) {
  const q = <T extends Element>(selector: string): T => {
    const el = root.querySelector<T>(selector);
    if (!el) throw new Error(`Playground markup is missing ${selector}`);
    return el;
  };
  return {
    title: q<HTMLElement>("[data-pg-title]"),
    nav: q<HTMLElement>("[data-pg-nav]"),
    editorHost: q<HTMLElement>("[data-pg-editor]"),
    output: q<HTMLElement>("[data-pg-output]"),
    runButton: q<HTMLButtonElement>("[data-pg-run]"),
    autorun: q<HTMLInputElement>("[data-pg-autorun]"),
    count: q<HTMLInputElement>("[data-pg-count]"),
    seed: q<HTMLInputElement>("[data-pg-seed]"),
    adapter: q<HTMLSelectElement>("[data-pg-adapter]"),
  };
}

export function bootPlayground(root: HTMLElement): void {
  const els = queryEls(root);

  let currentPreset: Preset = PRESETS[0];
  let currentCode = currentPreset.code;
  let editor: EditorView | null = null;
  let runId = 0;
  let runnerReady = false;
  let pendingRun = false;
  let autorunTimer: ReturnType<typeof setTimeout> | undefined;

  // ---------------------------------------------------------------- runner

  // Created only once the runtime bundles have been fetched (they're inlined
  // into the srcdoc import map). Runs queue on the ready handshake until then.
  let frame: HTMLIFrameElement | null = null;

  void fetchRuntimeBundles()
    .then((bundles) => {
      frame = document.createElement("iframe");
      frame.hidden = true;
      frame.setAttribute("sandbox", "allow-scripts");
      frame.title = "Playground code runner";
      frame.srcdoc = runnerSrcdoc(bundles);
      root.appendChild(frame);
    })
    .catch((err: unknown) =>
      showOutput("error", String((err as Error)?.message ?? err), "RuntimeLoadError"),
    );

  window.addEventListener("message", (e) => {
    if (!frame || e.source !== frame.contentWindow) return;
    const m = e.data as RunnerMessage;
    if (m?.type === "ready") {
      runnerReady = true;
      if (pendingRun) {
        pendingRun = false;
        run();
      }
    } else if (m?.type === "result") {
      if (m.id === runId) showOutput("result", m.json);
    } else if (m?.type === "error") {
      if (m.id === runId) showOutput("error", m.message, m.name);
    } else if (m?.type === "log") {
      appendLog(m.level, m.text);
    }
  });

  // ---------------------------------------------------------------- output

  function showOutput(kind: "idle" | "running" | "result" | "error", text: string, name?: string) {
    // data-state, not className — the structural styles are Tailwind
    // utilities in markup that must survive state changes.
    els.output.dataset.state = kind;
    els.output.replaceChildren();
    if (kind === "error") {
      const heading = document.createElement("div");
      heading.className = "pg-output-error-name";
      heading.textContent = name ?? "Error";
      els.output.appendChild(heading);
    }
    const pre = document.createElement("pre");
    pre.textContent = text;
    els.output.appendChild(pre);
  }

  function appendLog(level: string, text: string) {
    const line = document.createElement("div");
    line.className = `pg-output-log is-${level}`;
    line.textContent = `${level}: ${text}`;
    els.output.appendChild(line);
  }

  // ---------------------------------------------------------------- run

  function readOptions() {
    const adapter = els.adapter.value;
    return {
      count: num(els.count),
      seed: num(els.seed),
      adapter: adapter === "zod" || adapter === "valibot" ? adapter : undefined,
    };
  }

  function run() {
    if (!runnerReady) {
      pendingRun = true;
      return;
    }
    const id = ++runId;
    let js: string;
    try {
      js = transform(currentCode, { transforms: ["typescript"] }).code;
    } catch (err) {
      // Sucrase only strips types — a throw here is a syntax error in user code.
      showOutput("error", String((err as Error)?.message ?? err), "SyntaxError");
      return;
    }
    showOutput("running", "Running…");
    frame?.contentWindow?.postMessage({ type: "run", id, code: js, options: readOptions() }, "*");
  }

  function scheduleAutorun() {
    if (!els.autorun.checked) return;
    clearTimeout(autorunTimer);
    autorunTimer = setTimeout(run, AUTORUN_DELAY_MS);
  }

  /**
   * The adapter picker doubles as a library switcher: forcing an adapter
   * whose library doesn't match the loaded schema only ever errors, so when
   * the editor still holds an untouched preset, load the SAME example in the
   * other library (its `feature` counterpart — Zod "Scalars" ↔ Valibot
   * "Scalars"; no counterpart, e.g. the Errors preset, falls back to the
   * library's first preset). Edited code is never clobbered — the forced
   * adapter then surfaces its (descriptive) mismatch error, which is what
   * the escape hatch is for.
   */
  function onAdapterChange() {
    const adapter = els.adapter.value;
    if (adapter === "zod" || adapter === "valibot") {
      const untouchedPreset = currentCode === currentPreset.code;
      if (untouchedPreset && codeLibrary(currentCode) !== adapter) {
        const target =
          PRESETS.find(
            (p) =>
              p.feature !== undefined &&
              p.feature === currentPreset.feature &&
              codeLibrary(p.code) === adapter,
          ) ?? PRESETS.find((p) => codeLibrary(p.code) === adapter);
        if (target) {
          selectPreset(target);
          return;
        }
      }
    }
    scheduleAutorun();
  }

  // ---------------------------------------------------------------- presets

  function renderNav() {
    const groups = PRESET_SECTIONS.map((section) => {
      const group = document.createElement("div");
      group.className = "pg-group";
      const heading = document.createElement("div");
      heading.className = "pg-group-title";
      heading.textContent = section;
      group.appendChild(heading);
      for (const preset of PRESETS.filter((p) => p.section === section)) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "pg-preset";
        button.dataset.preset = preset.id;
        button.textContent = preset.title;
        button.addEventListener("click", () => selectPreset(preset));
        group.appendChild(button);
      }
      return group;
    });
    els.nav.replaceChildren(...groups);
  }

  function selectPreset(preset: Preset) {
    currentPreset = preset;
    currentCode = preset.code;
    els.title.textContent = preset.title;
    els.nav
      .querySelectorAll<HTMLElement>("[data-preset]")
      .forEach((el) => el.classList.toggle("is-active", el.dataset.preset === preset.id));
    editor?.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: preset.code },
    });
    if (els.autorun.checked) run();
  }

  // ---------------------------------------------------------------- editor

  async function mountEditor() {
    // Lazy: ~169 KB gz of editor stays out of the page's first paint.
    const [cm, langJs, lang, state, highlight] = await Promise.all([
      import("codemirror"),
      import("@codemirror/lang-javascript"),
      import("@codemirror/language"),
      import("@codemirror/state"),
      import("@lezer/highlight"),
    ]);
    const { EditorView, basicSetup } = cm;
    const { tags } = highlight;

    // Nord syntax palette via CSS vars — flips with the site's light/dark
    // theme (see Playground.astro styles), no JS theme swap needed.
    const nordHighlight = lang.HighlightStyle.define([
      { tag: [tags.keyword, tags.modifier], color: "var(--pg-syn-keyword)" },
      { tag: [tags.string, tags.special(tags.string)], color: "var(--pg-syn-string)" },
      { tag: [tags.number, tags.bool, tags.null, tags.atom], color: "var(--pg-syn-literal)" },
      { tag: [tags.propertyName, tags.attributeName], color: "var(--pg-syn-property)" },
      {
        tag: [tags.function(tags.variableName), tags.function(tags.propertyName)],
        color: "var(--pg-syn-function)",
      },
      { tag: [tags.typeName, tags.className], color: "var(--pg-syn-type)" },
      { tag: tags.comment, color: "var(--pg-syn-comment)", fontStyle: "italic" },
    ]);

    const themeCompartment = new state.Compartment();
    const editorTheme = () =>
      EditorView.theme(
        {
          "&": {
            backgroundColor: "var(--pg-editor-bg)",
            color: "var(--pg-editor-fg)",
            fontSize: "0.8125rem",
            maxHeight: "100%",
          },
          ".cm-content, .cm-gutters": { fontFamily: "var(--sl-font-mono)" },
          ".cm-gutters": {
            backgroundColor: "var(--pg-editor-bg)",
            color: "var(--pg-gutter-fg)",
            border: "none",
          },
          ".cm-activeLine": { backgroundColor: "var(--pg-active-line)" },
          ".cm-activeLineGutter": { backgroundColor: "transparent" },
          "&.cm-focused": { outline: "none" },
          ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
            backgroundColor: "var(--pg-selection) !important",
          },
        },
        { dark: isDark() },
      );

    editor = new EditorView({
      doc: currentCode,
      extensions: [
        basicSetup,
        langJs.javascript({ typescript: true }),
        lang.syntaxHighlighting(nordHighlight),
        themeCompartment.of(editorTheme()),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            currentCode = update.state.doc.toString();
            scheduleAutorun();
          }
        }),
      ],
      parent: els.editorHost,
    });
    els.editorHost.querySelector("[data-pg-loading]")?.remove();

    // Follow the site's theme toggle for CM's own dark/light defaults.
    new MutationObserver(() =>
      editor?.dispatch({ effects: themeCompartment.reconfigure(editorTheme()) }),
    ).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  }

  // ---------------------------------------------------------------- wiring

  els.runButton.addEventListener("click", run);
  els.autorun.addEventListener("change", () => {
    if (els.autorun.checked) run();
  });
  els.adapter.addEventListener("change", onAdapterChange);
  for (const input of [els.count, els.seed]) {
    input.addEventListener("input", scheduleAutorun);
  }

  renderNav();
  // selectPreset triggers the initial auto-run (queued until the runner's
  // ready handshake if the iframe hasn't parsed yet).
  selectPreset(currentPreset);
  showOutput("idle", els.autorun.checked ? "Editing re-runs automatically." : "Press ▶ Run.");
  void mountEditor();
}
