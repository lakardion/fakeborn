// PROTOTYPE — throwaway. Answers fakeborn#26: what should the playground look and behave like?
// Variants: A "Workbench" (split panes), B "Docs sidebar" (nav + auto-run), C "Feature gallery" (browse → workspace).
// Switch via ?variant=A|B|C or the floating bottom bar.

import { EditorView, basicSetup } from "codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { PRESETS, type Preset } from "./presets";

// ---------------------------------------------------------------- state

const VARIANTS = [
  { key: "A", name: "Workbench — split panes" },
  { key: "B", name: "Docs sidebar — auto-run" },
  { key: "C", name: "Feature gallery — browse first" },
] as const;

type VariantKey = (typeof VARIANTS)[number]["key"];

let currentPreset: Preset = PRESETS[0];
let currentCode = PRESETS[0].code;
let editor: EditorView | null = null;
let iframe: HTMLIFrameElement | null = null;
let autorunTimer: ReturnType<typeof setTimeout> | undefined;

function variantKey(): VariantKey {
  const v = new URLSearchParams(location.search).get("variant");
  return v === "B" || v === "C" ? v : "A";
}

// ---------------------------------------------------------------- iframe runner
// Sandboxed iframe + import map (data: URLs) — the Valibot pattern, per fakeborn#23.
// Convention: user code declares a top-level `schema`; the harness fakes it with
// the UI's options, so count/seed/adapter ALWAYS apply.

async function bootRunner(): Promise<HTMLIFrameElement> {
  const [zod, valibot, fakeborn] = await Promise.all(
    ["zod", "valibot", "fakeborn"].map((n) =>
      fetch(`/dist/runtime/${n}.js`).then((r) => r.text()),
    ),
  );
  const imports = Object.fromEntries(
    Object.entries({ zod, valibot, fakeborn }).map(([k, code]) => [
      k,
      "data:text/javascript;charset=utf-8," + encodeURIComponent(code),
    ]),
  );
  const frame = document.createElement("iframe");
  frame.hidden = true;
  frame.setAttribute("sandbox", "allow-scripts");
  frame.srcdoc = `<!doctype html><html><head><script type="importmap">${JSON.stringify({ imports })}</script></head><body><script type="module">
const send = (m) => parent.postMessage(m, "*");
for (const level of ["log", "warn", "error"]) {
  const orig = console[level];
  console[level] = (...a) => {
    send({ type: "log", level, text: a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ") });
    orig(...a);
  };
}
window.addEventListener("error", (e) =>
  send({ type: "error", name: e.error?.name ?? "Error", message: String(e.error?.message ?? e.message) }));
window.addEventListener("unhandledrejection", (e) =>
  send({ type: "error", name: e.reason?.name ?? "UnhandledRejection", message: String(e.reason?.message ?? e.reason) }));
const replacer = (_k, v) => (typeof v === "bigint" ? v.toString() + "n" : v);
window.addEventListener("message", (e) => {
  if (!e.data || e.data.type !== "run") return;
  globalThis.__run = async (schema) => {
    try {
      const { fake } = await import("fakeborn");
      send({ type: "result", json: JSON.stringify(fake(schema, e.data.options), replacer, 2) });
    } catch (err) {
      send({ type: "error", name: err?.name ?? "Error", message: String(err?.message ?? err) });
    }
  };
  const s = document.createElement("script");
  s.type = "module";
  s.textContent = e.data.code + "\\n;globalThis.__run(schema);";
  document.body.appendChild(s);
});
<\/script></body></html>`;
  document.body.appendChild(frame);
  return frame;
}

// ---------------------------------------------------------------- output pane

function outputEl(): HTMLElement {
  return document.querySelector(".output")!;
}

function showOutput(kind: "idle" | "running" | "result" | "error", text: string, name?: string) {
  const el = outputEl();
  el.className = `output is-${kind}`;
  el.innerHTML = "";
  if (kind === "error") {
    const h = document.createElement("div");
    h.className = "output-error-name";
    h.textContent = name ?? "Error";
    const p = document.createElement("pre");
    p.textContent = text;
    el.append(h, p);
  } else {
    const p = document.createElement("pre");
    p.textContent = text;
    el.appendChild(p);
  }
}

window.addEventListener("message", (e) => {
  const m = e.data;
  if (m?.type === "result") showOutput("result", m.json);
  else if (m?.type === "error") showOutput("error", m.message, m.name);
  else if (m?.type === "log") {
    const line = document.createElement("div");
    line.className = `output-log is-${m.level}`;
    line.textContent = `${m.level}: ${m.text}`;
    outputEl().appendChild(line);
  }
});

// ---------------------------------------------------------------- options + run

function readOptions() {
  const num = (name: string) => {
    const v = (document.querySelector(`[name="${name}"]`) as HTMLInputElement | null)?.valueAsNumber;
    return Number.isFinite(v) ? v : undefined;
  };
  const adapter = (document.querySelector('[name="adapter"]') as HTMLSelectElement | null)?.value;
  return {
    count: num("count"),
    seed: num("seed"),
    adapter: adapter === "zod" || adapter === "valibot" ? adapter : undefined,
  };
}

function run() {
  if (!iframe?.contentWindow) return;
  showOutput("running", "Running…");
  iframe.contentWindow.postMessage({ type: "run", code: currentCode, options: readOptions() }, "*");
}

function scheduleAutorun() {
  clearTimeout(autorunTimer);
  autorunTimer = setTimeout(run, 500);
}

function optionsControls(): string {
  return `<label>count <input name="count" type="number" min="1" placeholder="1" /></label>
<label>seed <input name="seed" type="number" placeholder="random" /></label>
<label>adapter <select name="adapter">
  <option value="">auto</option><option value="zod">zod</option><option value="valibot">valibot</option>
</select></label>`;
}

// ---------------------------------------------------------------- editor

function mountEditor(host: HTMLElement, onChange?: () => void) {
  editor?.destroy();
  editor = new EditorView({
    doc: currentCode,
    extensions: [
      basicSetup,
      javascript({ typescript: true }),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) {
          currentCode = u.state.doc.toString();
          onChange?.();
        }
      }),
      EditorView.theme({}, { dark: true }),
    ],
    parent: host,
  });
}

function loadPreset(p: Preset, autorun: boolean) {
  currentPreset = p;
  currentCode = p.code;
  if (editor) {
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: p.code } });
  }
  document.querySelectorAll("[data-preset]").forEach((el) => {
    el.classList.toggle("is-active", (el as HTMLElement).dataset.preset === p.id);
  });
  if (autorun) run();
}

// ---------------------------------------------------------------- variants

function renderWorkbench(root: HTMLElement) {
  document.body.className = "variant-a";
  root.innerHTML = `
<header class="a-header">
  <span class="logo">fakeborn <em>playground · PROTOTYPE</em></span>
  <nav class="a-pills">
    ${PRESETS.map((p) => `<button data-preset="${p.id}" class="${p.id === currentPreset.id ? "is-active" : ""}">${p.section} · ${p.title}</button>`).join("")}
  </nav>
  <button class="run-btn">▶ Run</button>
</header>
<main class="a-main">
  <section class="cm-host"></section>
  <section class="a-side">
    <div class="options">${optionsControls()}</div>
    <div class="output is-idle"><pre>Press Run.</pre></div>
  </section>
</main>`;
  root.querySelectorAll("[data-preset]").forEach((b) =>
    b.addEventListener("click", () => loadPreset(PRESETS.find((p) => p.id === (b as HTMLElement).dataset.preset)!, false)),
  );
  root.querySelector(".run-btn")!.addEventListener("click", run);
  mountEditor(root.querySelector(".cm-host")!);
}

function renderSidebar(root: HTMLElement) {
  document.body.className = "variant-b";
  const sections = [...new Set(PRESETS.map((p) => p.section))];
  root.innerHTML = `
<div class="b-layout">
  <aside class="b-nav">
    <h3>fakeborn <em>PROTOTYPE</em></h3>
    ${sections
      .map(
        (s) => `<div class="b-group"><h4>${s}</h4>${PRESETS.filter((p) => p.section === s)
          .map((p) => `<button data-preset="${p.id}" class="${p.id === currentPreset.id ? "is-active" : ""}">${p.title}</button>`)
          .join("")}</div>`,
      )
      .join("")}
  </aside>
  <div class="b-main">
    <div class="b-toolbar">
      <strong>${currentPreset.title}</strong>
      <div class="options">${optionsControls()}</div>
      <span class="b-badge">auto-run</span>
    </div>
    <section class="cm-host"></section>
    <div class="output is-idle"><pre>Editing re-runs automatically.</pre></div>
  </div>
</div>`;
  root.querySelectorAll("[data-preset]").forEach((b) =>
    b.addEventListener("click", () => {
      loadPreset(PRESETS.find((p) => p.id === (b as HTMLElement).dataset.preset)!, true);
      root.querySelector(".b-toolbar strong")!.textContent = currentPreset.title;
    }),
  );
  root.querySelectorAll(".options input, .options select").forEach((i) => i.addEventListener("input", scheduleAutorun));
  mountEditor(root.querySelector(".cm-host")!, scheduleAutorun);
  run();
}

function renderGallery(root: HTMLElement) {
  document.body.className = "variant-c";
  root.innerHTML = `
<main class="c-gallery">
  <h1>fakeborn playground <em>PROTOTYPE</em></h1>
  <p class="c-sub">Every feature of <code>fake()</code>, one working example each. Pick one, poke it.</p>
  <div class="c-grid">
    ${PRESETS.map(
      (p) => `<button class="c-card" data-preset="${p.id}">
        <span class="c-tag is-${p.section.toLowerCase()}">${p.section}</span>
        <strong>${p.title}</strong>
        <span class="c-blurb">${p.blurb}</span>
        <pre>${p.code.split("\n").slice(2, 6).join("\n")}…</pre>
      </button>`,
    ).join("")}
  </div>
</main>`;
  root.querySelectorAll("[data-preset]").forEach((b) =>
    b.addEventListener("click", () => {
      currentPreset = PRESETS.find((p) => p.id === (b as HTMLElement).dataset.preset)!;
      currentCode = currentPreset.code;
      renderGalleryWorkspace(root);
    }),
  );
}

function renderGalleryWorkspace(root: HTMLElement) {
  root.innerHTML = `
<header class="c-header">
  <button class="c-back">← All features</button>
  <strong>${currentPreset.section} · ${currentPreset.title}</strong>
  <div class="options">${optionsControls()}</div>
  <button class="run-btn">▶ Run</button>
</header>
<main class="c-main">
  <section class="cm-host"></section>
  <div class="output is-idle"><pre>Press Run.</pre></div>
</main>`;
  root.querySelector(".c-back")!.addEventListener("click", () => renderGallery(root));
  root.querySelector(".run-btn")!.addEventListener("click", run);
  mountEditor(root.querySelector(".cm-host")!);
  run();
}

// ---------------------------------------------------------------- switcher bar

function setVariant(key: VariantKey) {
  const params = new URLSearchParams(location.search);
  params.set("variant", key);
  history.replaceState(null, "", `?${params}`);
  render(document.getElementById("root")!, key);
}

function mountSwitcher() {
  const bar = document.createElement("div");
  bar.className = "proto-switcher";
  document.body.appendChild(bar);
  const paint = () => {
    const cur = VARIANTS.find((v) => v.key === variantKey())!;
    bar.innerHTML = `<button data-dir="-1">←</button><span>${cur.key} — ${cur.name}</span><button data-dir="1">→</button>`;
    bar.querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => cycle(Number((b as HTMLElement).dataset.dir))),
    );
  };
  const cycle = (dir: number) => {
    const i = VARIANTS.findIndex((v) => v.key === variantKey());
    setVariant(VARIANTS[(i + dir + VARIANTS.length) % VARIANTS.length].key);
  };
  window.addEventListener("keydown", (e) => {
    const t = e.target as HTMLElement;
    if (t.closest("input, textarea, select, [contenteditable], .cm-editor")) return;
    if (e.key === "ArrowLeft") cycle(-1);
    if (e.key === "ArrowRight") cycle(1);
  });
  window.addEventListener("popstate", paint);
  paint();
  return { repaint: paint };
}

// ---------------------------------------------------------------- boot

function render(root: HTMLElement, key: VariantKey) {
  if (key === "A") renderWorkbench(root);
  else if (key === "B") renderSidebar(root);
  else renderGallery(root);
  switcher?.repaint();
}

const root = document.getElementById("root")!;
iframe = await bootRunner();
const switcher = mountSwitcher();
render(root, variantKey());
