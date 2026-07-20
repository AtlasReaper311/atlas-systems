const PUBLIC_API_ORIGIN = "https://api.atlas-systems.uk";
const API_TIMEOUT_MS = 7000;
const OUTPUT_CHAR_LIMIT = 6000;
const OUTPUT_LINE_LIMIT = 80;

const API_ALIASES = new Map([
  ["api", "/v1"],
  ["v1", "/v1"],
  ["registry", "/v1/registry"],
  ["topology", "/v1/topology"],
  ["reliability", "/v1/reliability"],
  ["objectives", "/v1/reliability/objectives"],
  ["dora", "/dora/metrics"],
]);

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>\"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
  })[character]);
}

function terminalOutput() {
  return document.querySelector(".term-output");
}

function appendLine(html, className = "") {
  const output = terminalOutput();
  if (!output) return null;
  const line = document.createElement("div");
  line.className = `term-line${className ? ` ${className}` : ""}`;
  line.innerHTML = html;
  output.appendChild(line);
  output.scrollTop = output.scrollHeight;
  return line;
}

function echoCommand(command) {
  appendLine(
    `<span class="t-prompt">atlas@edge:~$</span> ${escapeHtml(command)}`,
    "t-echo",
  );
}

function normalizeCurlTarget(raw) {
  const target = String(raw || "").trim();
  if (!target || target.toLowerCase() === "api") return "/v1";

  const withoutApi = target.replace(/^api\s+/i, "").trim();
  const alias = API_ALIASES.get(withoutApi.toLowerCase());
  if (alias) return alias;

  if (/^https?:\/\//i.test(withoutApi)) {
    const url = new URL(withoutApi);
    if (url.origin !== PUBLIC_API_ORIGIN) {
      throw new Error("external origins are not available from this shell");
    }
    return `${url.pathname}${url.search}`;
  }

  const path = withoutApi.startsWith("/") ? withoutApi : `/${withoutApi}`;
  return path;
}

function boundedOutput(value) {
  const text = String(value == null ? "" : value);
  const lines = text.split("\n").slice(0, OUTPUT_LINE_LIMIT);
  let bounded = lines.join("\n");
  if (bounded.length > OUTPUT_CHAR_LIMIT) bounded = bounded.slice(0, OUTPUT_CHAR_LIMIT);
  const truncated = lines.length < text.split("\n").length || bounded.length < text.length;
  return { text: bounded, truncated };
}

async function runCurlApi(command) {
  echoCommand(command);

  let path;
  try {
    path = normalizeCurlTarget(command.replace(/^curl\s+/i, ""));
  } catch (error) {
    appendLine(`<span class="t-err">curl blocked.</span> <span class="t-dim">${escapeHtml(error.message)}</span>`);
    return;
  }

  const url = new URL(path, PUBLIC_API_ORIGIN);
  if (url.origin !== PUBLIC_API_ORIGIN) {
    appendLine('<span class="t-err">curl blocked.</span> <span class="t-dim">this shell only reads the public Atlas API.</span>');
    return;
  }

  const pending = appendLine(`<span class="t-dim">GET ${escapeHtml(url.pathname + url.search)}…</span>`);
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(url.href, {
      method: "GET",
      headers: { Accept: "application/json, text/plain;q=0.9" },
      cache: "no-store",
      signal: controller.signal,
    });
    const raw = await response.text();
    let rendered = raw;
    const contentType = response.headers.get("content-type") || "";
    if (/json/i.test(contentType)) {
      try {
        rendered = JSON.stringify(JSON.parse(raw), null, 2);
      } catch {
        rendered = raw;
      }
    }
    const bounded = boundedOutput(rendered);
    if (pending) {
      pending.innerHTML = `<span class="${response.ok ? "t-ok" : "t-err"}">HTTP ${response.status}</span> <span class="t-faint">${escapeHtml(url.pathname + url.search)}</span>`;
    }
    appendLine(`<span class="t-dim">${escapeHtml(bounded.text)}</span>`, "t-row");
    if (bounded.truncated) {
      appendLine('<span class="t-faint">output truncated in the browser shell; query the endpoint directly for the full document.</span>');
    }
  } catch (error) {
    if (pending) {
      pending.innerHTML = error?.name === "AbortError"
        ? '<span class="t-err">request timed out.</span> <span class="t-dim">the public API did not answer within 7 seconds.</span>'
        : '<span class="t-err">public API unreachable.</span> <span class="t-dim">no response was claimed.</span>';
    }
  } finally {
    window.clearTimeout(timeout);
  }
}

function commandIsCurlApi(value) {
  const command = String(value || "").trim();
  if (!/^curl(?:\s|$)/i.test(command)) return false;
  const target = command.replace(/^curl\s*/i, "").trim();
  if (!target) return true;
  if (/^api(?:\s|$)/i.test(target)) return true;
  if (target.startsWith("/")) return true;
  if (API_ALIASES.has(target.toLowerCase())) return true;
  try {
    return new URL(target).origin === PUBLIC_API_ORIGIN;
  } catch {
    return false;
  }
}

function installCurlInterceptor() {
  document.addEventListener("keydown", (event) => {
    const target = event.target;
    if (event.key !== "Enter" || !(target instanceof HTMLInputElement)) return;
    if (!target.classList.contains("term-input")) return;
    const command = target.value.trim();
    if (!commandIsCurlApi(command)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    target.value = "";
    void runCurlApi(command || "curl api");
  }, true);
}

function enhanceTerminalUi(root = document) {
  const trigger = root.querySelector?.(".term-nav-trigger");
  if (trigger && trigger.textContent !== ">_ shell") {
    trigger.textContent = ">_ shell";
    trigger.setAttribute("title", "Open interactive estate shell (`)");
  }

  const examples = root.querySelector?.(".term-examples");
  if (examples && !examples.querySelector('[data-terminal-curl-example="true"]')) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "term-example";
    button.dataset.terminalCurlExample = "true";
    button.textContent = "curl api";
    button.addEventListener("click", () => void runCurlApi("curl api"));
    examples.appendChild(button);
  }
}

function observeTerminalUi() {
  enhanceTerminalUi();
  const observer = new MutationObserver(() => enhanceTerminalUi());
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

installCurlInterceptor();

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", observeTerminalUi, { once: true });
} else {
  observeTerminalUi();
}
