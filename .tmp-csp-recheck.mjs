import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleErrors = [];
page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
page.on('pageerror', err => consoleErrors.push(`[pageerror] ${err.message}`));

await page.goto("http://localhost:3002/", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

console.log("console/page errors:", consoleErrors.length);
console.log(consoleErrors.join("\n") || "(none)");

await browser.close();
