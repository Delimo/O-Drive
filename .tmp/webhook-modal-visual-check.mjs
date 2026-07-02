import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { chromium } from "playwright";

const root = resolve("public");
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === "/") pathname = "/index.html";
    if (pathname === "/admin") pathname = "/admin.html";
    const file = resolve(join(root, pathname));
    if (!file.startsWith(root)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});

await new Promise((done) => server.listen(0, "127.0.0.1", done));
const { port } = server.address();
const baseUrl = `http://127.0.0.1:${port}`;

const browser = await chromium.launch({ headless: true });
const checks = [];

async function inspect(label, viewport) {
  const page = await browser.newPage({ viewport });
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (["error", "warning"].includes(msg.type())) consoleErrors.push(`${msg.type()}: ${msg.text()}`);
  });
  page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));

  await page.goto(`${baseUrl}/admin?mock=1`, { waitUntil: "networkidle", timeout: 30000 });
  await page.locator('[data-tab="webhook"]').click();
  await page.locator('[data-action="show-add-webhook"]').click();
  await page.locator(".webhook-modal-card").waitFor({ state: "visible", timeout: 10000 });
  await page.evaluate(() => {
    const advanced = document.querySelector(".webhook-modal-advanced");
    if (advanced) advanced.open = true;
  });
  await page.waitForTimeout(260);
  await page.locator('input[name="eventMode"][value="all"]').check({ force: true });
  await page.waitForTimeout(120);

  const metrics = await page.evaluate(() => {
    const card = document.querySelector(".webhook-modal-card");
    const layout = document.querySelector(".webhook-modal-layout");
    const main = document.querySelector(".webhook-modal-main");
    const side = document.querySelector(".webhook-modal-side");
    const headers = document.querySelector('textarea[name="headers"]');
    const body = document.querySelector('textarea[name="body"]');
    const form = document.querySelector(".webhook-modal-card .modal-form");
    const eventList = document.querySelector('[data-role="webhook-event-custom"]');
    const eventInputs = Array.from(document.querySelectorAll('input[name="events"]'));
    const eventSummary = document.querySelector('[data-role="webhook-event-summary"]');
    const blocks = Array.from(document.querySelectorAll(
      ".webhook-modal-section, .webhook-modal-advanced, .webhook-modal-card .helper-text, .webhook-modal-card .error-text, .webhook-modal-card .btn-row",
    ));
    const box = (node) => {
      const rect = node.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    const viewportWidth = window.innerWidth;
    return {
      card: box(card),
      layoutColumns: getComputedStyle(layout).gridTemplateColumns,
      headers: box(headers),
      body: box(body),
      form: box(form),
      columnBottomGap: Math.abs(main.getBoundingClientRect().bottom - side.getBoundingClientRect().bottom),
      resize: {
        headers: getComputedStyle(headers).resize,
        body: getComputedStyle(body).resize,
      },
      events: {
        count: eventInputs.length,
        checked: eventInputs.filter((input) => input.checked).length,
        disabled: eventInputs.filter((input) => input.disabled).length,
        hidden: getComputedStyle(eventList).display === "none",
        allModeClass: eventList.classList.contains("is-all-mode"),
        summary: eventSummary?.textContent || "",
      },
      overflowX: document.documentElement.scrollWidth > viewportWidth + 1,
      overlappingBlocks: blocks.some((section, index) => {
        const a = section.getBoundingClientRect();
        return blocks.slice(index + 1).some((other) => {
          const b = other.getBoundingClientRect();
          const horizontal = a.left < b.right && a.right > b.left;
          const vertical = a.top < b.bottom && a.bottom > b.top;
          return horizontal && vertical;
        });
      }),
    };
  });

  const columnCount = metrics.layoutColumns.split(" ").filter(Boolean).length;
  const expectedColumns = viewport.width <= 980 ? 1 : 2;
  if (columnCount !== expectedColumns) {
    throw new Error(`${label}: expected ${expectedColumns} layout column(s), got ${metrics.layoutColumns}`);
  }
  if (metrics.headers.height < 150 || metrics.body.height < 150) {
    throw new Error(`${label}: textarea height too small: ${metrics.headers.height}/${metrics.body.height}`);
  }
  if (metrics.resize.headers !== "none" || metrics.resize.body !== "none") {
    throw new Error(`${label}: textarea resize should be none, got ${metrics.resize.headers}/${metrics.resize.body}`);
  }
  if (expectedColumns > 1 && metrics.columnBottomGap > 1) {
    throw new Error(`${label}: modal columns are not aligned, bottom gap ${metrics.columnBottomGap}`);
  }
  if (metrics.events.hidden || metrics.events.checked !== metrics.events.count || !metrics.events.allModeClass) {
    throw new Error(`${label}: all-events view is not visibly selected: ${JSON.stringify(metrics.events)}`);
  }
  if (metrics.overflowX) {
    throw new Error(`${label}: page has horizontal overflow`);
  }
  if (metrics.overlappingBlocks) {
    throw new Error(`${label}: modal content blocks overlap`);
  }
  const severeErrors = consoleErrors.filter((line) => !line.includes("favicon"));
  if (severeErrors.length) {
    throw new Error(`${label}: console errors: ${severeErrors.join(" | ")}`);
  }
  await page.screenshot({ path: `.tmp/webhook-modal-${label}.png`, fullPage: true });
  const bottom = await page.evaluate(() => {
    const form = document.querySelector(".webhook-modal-card .modal-form");
    const card = document.querySelector(".webhook-modal-card").getBoundingClientRect();
    form.scrollTop = form.scrollHeight;
    const btn = document.querySelector(".webhook-modal-card .btn-row").getBoundingClientRect();
    return {
      btnVisible: btn.top >= card.top && btn.bottom <= card.bottom,
      scrollTop: form.scrollTop,
    };
  });
  if (!bottom.btnVisible) {
    throw new Error(`${label}: bottom buttons are not reachable after scrolling`);
  }
  checks.push({ label, ...metrics });
  await page.close();
}

try {
  await inspect("desktop", { width: 1440, height: 960 });
  await inspect("mobile", { width: 390, height: 844 });
  console.log(JSON.stringify(checks, null, 2));
} finally {
  await browser.close();
  server.close();
}
