# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: accessibility.e2e.ts >> Mobile app — accessibility (axe WCAG 2.1 A/AA) >> Dashboard tab has no critical/serious violations
- Location: e2e\accessibility.e2e.ts:48:9

# Error details

```
Error: expect(received).toHaveLength(expected)

Expected length: 0
Received length: 1
Received array:  [{"description": "Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds", "help": "Elements must meet minimum color contrast ratio thresholds", "helpUrl": "https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright", "id": "color-contrast", "impact": "serious", "nodes": [{"all": [], "any": [{"data": {"bgColor": "#17171a", "contrastRatio": 3.7, "expectedContrastRatio": "4.5:1", "fgColor": "#71717a", "fontSize": "10.5pt (14px)", "fontWeight": "normal", "messageKey": null}, "id": "color-contrast", "impact": "serious", "message": "Element has insufficient color contrast of 3.7 (foreground color: #71717a, background color: #17171a, font size: 10.5pt (14px), font weight: normal). Expected contrast ratio of 4.5:1", "relatedNodes": [{"html": "<div class=\"css-view-g5y9jx r-backgroundColor-1276npn r-borderColor-5vk2r4 r-borderRadius-kdyh1x r-borderWidth-rs99b7 r-padding-xyw6el\">", "target": [".r-borderColor-5vk2r4.r-borderRadius-kdyh1x.r-padding-xyw6el:nth-child(1)"]}, {"html": "<div class=\"css-view-g5y9jx r-paddingBottom-97e31f r-paddingLeft-bv2aro r-paddingRight-hxflta r-backgroundColor-1ejn4w2 r-flex-13awgt0 r-paddingTop-1ur9v65\">", "target": [".r-paddingBottom-97e31f"]}]}], "failureSummary": "Fix any of the following:
  Element has insufficient color contrast of 3.7 (foreground color: #71717a, background color: #17171a, font size: 10.5pt (14px), font weight: normal). Expected contrast ratio of 4.5:1", "html": "<div dir=\"auto\" class=\"css-text-146c3p1 r-color-1w88h0j r-fontSize-1b43r93\">Active Specialist:</div>", "impact": "serious", "none": [], "target": [".r-borderColor-5vk2r4.r-borderRadius-kdyh1x.r-padding-xyw6el:nth-child(1) > .r-marginBottom-f1odvy.r-justifyContent-1wtj0ep.r-flexDirection-18u37iz:nth-child(2) > .r-color-1w88h0j.r-fontSize-1b43r93.css-text-146c3p1"]}, {"all": [], "any": [{"data": {"bgColor": "#17171a", "contrastRatio": 3.7, "expectedContrastRatio": "4.5:1", "fgColor": "#71717a", "fontSize": "10.5pt (14px)", "fontWeight": "normal", "messageKey": null}, "id": "color-contrast", "impact": "serious", "message": "Element has insufficient color contrast of 3.7 (foreground color: #71717a, background color: #17171a, font size: 10.5pt (14px), font weight: normal). Expected contrast ratio of 4.5:1", "relatedNodes": [{"html": "<div class=\"css-view-g5y9jx r-backgroundColor-1276npn r-borderColor-5vk2r4 r-borderRadius-kdyh1x r-borderWidth-rs99b7 r-padding-xyw6el\">", "target": [".r-borderColor-5vk2r4.r-borderRadius-kdyh1x.r-padding-xyw6el:nth-child(1)"]}, {"html": "<div class=\"css-view-g5y9jx r-paddingBottom-97e31f r-paddingLeft-bv2aro r-paddingRight-hxflta r-backgroundColor-1ejn4w2 r-flex-13awgt0 r-paddingTop-1ur9v65\">", "target": [".r-paddingBottom-97e31f"]}]}], "failureSummary": "Fix any of the following:
  Element has insufficient color contrast of 3.7 (foreground color: #71717a, background color: #17171a, font size: 10.5pt (14px), font weight: normal). Expected contrast ratio of 4.5:1", "html": "<div dir=\"auto\" class=\"css-text-146c3p1 r-color-1w88h0j r-fontSize-1b43r93\">Task Completion:</div>", "impact": "serious", "none": [], "target": [".r-borderColor-5vk2r4.r-borderRadius-kdyh1x.r-padding-xyw6el:nth-child(1) > .r-marginBottom-f1odvy.r-justifyContent-1wtj0ep.r-flexDirection-18u37iz:nth-child(3) > .r-color-1w88h0j.r-fontSize-1b43r93.css-text-146c3p1"]}], "tags": ["cat.color", "wcag2aa", "wcag143", "TTv5", "TT13.c", "EN-301-549", "EN-9.1.4.3", "ACT", "RGAAv4", "RGAA-3.2.1"]}]
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e3]:
    - generic [ref=e4]:
      - generic [ref=e5]: ⚡ KRYLEOS FORGE // COMPANION
      - button "Toggle network offline simulator mode" [ref=e6] [cursor=pointer]:
        - generic [ref=e8]: BACKEND ONLINE
    - tablist [ref=e9]:
      - tab "Dashboard tab" [active] [ref=e10] [cursor=pointer]:
        - generic [ref=e11]: 📊
        - generic [ref=e12]: Dashboard
      - tab "Plan tab" [ref=e14] [cursor=pointer]:
        - generic [ref=e15]: 📋
        - generic [ref=e16]: Plan
      - tab "Chat tab" [ref=e17] [cursor=pointer]:
        - generic [ref=e18]: 💬
        - generic [ref=e19]: Chat
      - tab "Tasks tab" [ref=e20] [cursor=pointer]:
        - generic [ref=e21]: ✓
        - generic [ref=e22]: Tasks
      - tab "Settings tab" [ref=e23] [cursor=pointer]:
        - generic [ref=e24]: ⚙️
        - generic [ref=e25]: Settings
    - generic [ref=e29]:
      - generic [ref=e30]:
        - generic [ref=e31]: WORKSPACE TELEMETRY
        - generic [ref=e32]:
          - generic [ref=e33]: "Active Specialist:"
          - generic [ref=e34]: IDLE
        - generic [ref=e35]:
          - generic [ref=e36]: "Task Completion:"
          - generic [ref=e37]: 25% (1/4)
      - generic [ref=e40]:
        - generic [ref=e41]:
          - generic [ref=e42]:
            - generic [ref=e43]: VOICE SCOPING QUEUE
            - generic [ref=e44]: SIMULATOR
          - button "Record a simulated voice note" [ref=e45] [cursor=pointer]:
            - generic [ref=e46]: 🎤 RECORD
        - generic [ref=e47]:
          - generic [ref=e48]:
            - generic [ref=e49]: 🔊 NOTE 0:14 (28 KB)
            - generic [ref=e50]: 12:23:37 AM
          - generic [ref=e51]: "Simulated voice note: Add security scanner middleware to express server"
          - generic [ref=e52]:
            - generic [ref=e54] [cursor=pointer]: PLAY
            - generic [ref=e56] [cursor=pointer]: ☁ SYNC
            - generic [ref=e58] [cursor=pointer]: DELETE
        - generic [ref=e59]:
          - generic [ref=e60]:
            - generic [ref=e61]: 🔊 NOTE 0:32 (64 KB)
            - generic [ref=e62]: 1:03:37 AM
          - generic [ref=e63]: "Simulated voice note: Implement command approval hooks in companion client"
          - generic [ref=e64]:
            - generic [ref=e66] [cursor=pointer]: PLAY
            - generic [ref=e68] [cursor=pointer]: ☁ SYNC
            - generic [ref=e70] [cursor=pointer]: DELETE
      - generic [ref=e71]:
        - generic [ref=e72]: LIVE DESKTOP COMMAND TRACES
        - generic [ref=e75]: No remote execution traces received. Connect companion node to start receiving trace logs.
      - generic [ref=e76]:
        - generic [ref=e77]:
          - generic [ref=e78]: DESKTOP PROCESS TELEMETRY
          - generic [ref=e79]: AWAITING DATA
        - generic [ref=e80]:
          - generic [ref=e81]: "CPU Load:"
          - generic [ref=e82]: —
        - generic [ref=e83]:
          - generic [ref=e84]: "Memory (RSS):"
          - generic [ref=e85]: —
        - generic [ref=e86]: LATEST EXECUTION TRACE
        - generic [ref=e87]: No execution trace received yet for this session.
      - generic [ref=e88]:
        - generic [ref=e89]:
          - generic [ref=e90]: API TOKEN CONSUMPTION
          - generic [ref=e91]: MOCK DATA
        - generic [ref=e92]:
          - generic [ref=e93]: "Session Tokens:"
          - generic [ref=e94]: 24,580
        - generic [ref=e95]:
          - generic [ref=e96]: "Estimated Cost:"
          - generic [ref=e97]: $0.049 USD
      - generic [ref=e98]:
        - generic [ref=e99]:
          - generic [ref=e100]: REMOTE SANDBOX SHORTCUTS
          - generic [ref=e101]: SIMULATOR
        - generic [ref=e102]:
          - button "Run build command remotely" [ref=e103] [cursor=pointer]:
            - generic [ref=e104]: 🔨 RUN BUILD
          - button "Run linter remotely" [ref=e105] [cursor=pointer]:
            - generic [ref=e106]: ✨ RUN LINT
          - button "Run tests remotely" [ref=e107] [cursor=pointer]:
            - generic [ref=e108]: 🧪 RUN TEST
          - button "Run git status remotely" [ref=e109] [cursor=pointer]:
            - generic [ref=e110]: ☁️ GIT STATUS
  - generic:
    - img
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import AxeBuilder from '@axe-core/playwright';
  3  | 
  4  | /**
  5  |  * Mobile companion app — WCAG 2.1 A/AA accessibility audit (Expo Web).
  6  |  *
  7  |  * Covers: addresses A11Y-NEW-02 (no accessibility test for Mobile).
  8  |  * Scans each tab for critical/serious axe violations.
  9  |  *
  10 |  * Pass/fail: zero critical OR serious violations per tab.
  11 |  * Moderate/minor logged as informational (terminal-aesthetic intentional design).
  12 |  */
  13 | 
  14 | const BLOCKING = new Set(['critical', 'serious']);
  15 | 
  16 | async function axeScan(page: import('@playwright/test').Page) {
  17 |   const results = await new AxeBuilder({ page })
  18 |     .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
  19 |     .analyze();
  20 |   return results.violations;
  21 | }
  22 | 
  23 | const TABS = [
  24 |   { name: 'Dashboard', label: 'Dashboard' },
  25 |   { name: 'Plan', label: 'Plan' },
  26 |   { name: 'Tasks', label: 'Tasks' },
  27 |   { name: 'Settings', label: 'Settings' },
  28 | ];
  29 | 
  30 | test.describe('Mobile app — accessibility (axe WCAG 2.1 A/AA)', () => {
  31 |   test.beforeEach(async ({ page }) => {
  32 |     await page.goto('/');
  33 |     await page.waitForLoadState('domcontentloaded');
  34 |     await page.waitForTimeout(2000);
  35 |   });
  36 | 
  37 |   test('initial page load has no critical/serious violations', async ({ page }) => {
  38 |     const violations = await axeScan(page);
  39 |     const blocking = violations.filter(v => BLOCKING.has(v.impact ?? ''));
  40 |     if (blocking.length > 0) {
  41 |       const summary = blocking.map(v => `[${v.impact}] ${v.id}: ${v.description}`).join('\n');
  42 |       console.log(`Blocking violations on initial load:\n${summary}`);
  43 |     }
  44 |     expect(blocking).toHaveLength(0);
  45 |   });
  46 | 
  47 |   for (const { name, label } of TABS) {
  48 |     test(`${name} tab has no critical/serious violations`, async ({ page }) => {
  49 |       const tabEl = page.locator(`text="${label}"`).first();
  50 |       if (await tabEl.isVisible({ timeout: 2000 })) {
  51 |         await tabEl.click();
  52 |         await page.waitForTimeout(500);
  53 |       }
  54 |       const violations = await axeScan(page);
  55 |       const blocking = violations.filter(v => BLOCKING.has(v.impact ?? ''));
  56 |       if (blocking.length > 0) {
  57 |         const summary = blocking.map(v => `[${v.impact}] ${v.id}: ${v.description}`).join('\n');
  58 |         console.log(`Blocking violations on ${name} tab:\n${summary}`);
  59 |       }
> 60 |       expect(blocking).toHaveLength(0);
     |                        ^ Error: expect(received).toHaveLength(expected)
  61 |     });
  62 |   }
  63 | 
  64 |   test('interactive elements have accessible touch targets (min 44×44px)', async ({ page }) => {
  65 |     const buttons = page.locator('button:not([aria-hidden="true"])');
  66 |     const count = await buttons.count();
  67 |     const tooSmall: string[] = [];
  68 | 
  69 |     for (let i = 0; i < Math.min(count, 15); i++) {
  70 |       const btn = buttons.nth(i);
  71 |       if (!await btn.isVisible()) continue;
  72 |       const box = await btn.boundingBox();
  73 |       if (!box) continue;
  74 |       if (box.width < 44 || box.height < 44) {
  75 |         const label = await btn.textContent();
  76 |         tooSmall.push(`"${label?.trim()}" (${box.width.toFixed(0)}×${box.height.toFixed(0)}px)`);
  77 |       }
  78 |     }
  79 | 
  80 |     if (tooSmall.length > 0) {
  81 |       console.log(`Touch targets below 44×44px: ${tooSmall.join(', ')}`);
  82 |     }
  83 |     // Log as informational rather than hard-blocking (Expo Web scaling may differ)
  84 |     expect(tooSmall.length).toBeLessThan(5);
  85 |   });
  86 | });
  87 | 
```