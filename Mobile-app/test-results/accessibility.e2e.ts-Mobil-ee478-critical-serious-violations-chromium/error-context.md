# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: accessibility.e2e.ts >> Mobile app — accessibility (axe WCAG 2.1 A/AA) >> Tasks tab has no critical/serious violations
- Location: e2e\accessibility.e2e.ts:48:9

# Error details

```
Error: expect(received).toHaveLength(expected)

Expected length: 0
Received length: 2
Received array:  [{"description": "Ensure elements with ARIA roles have all required ARIA attributes", "help": "Required ARIA attributes must be provided", "helpUrl": "https://dequeuniversity.com/rules/axe/4.11/aria-required-attr?application=playwright", "id": "aria-required-attr", "impact": "critical", "nodes": [{"all": [], "any": [{"data": ["aria-checked"], "id": "aria-required-attr", "impact": "critical", "message": "Required ARIA attribute not present: aria-checked", "relatedNodes": []}], "failureSummary": "Fix any of the following:
  Required ARIA attribute not present: aria-checked", "html": "<div aria-label=\"Define remote databa...\" role=\"checkbox\" tabindex=\"0\" class=\"css-view-g5y9jx r-tr...\" style=\"flex: 1 1 0%; transi...\">", "impact": "critical", "none": [], "target": ["div[aria-label=\"Define remote database model\"]"]}, {"all": [], "any": [{"data": ["aria-checked"], "id": "aria-required-attr", "impact": "critical", "message": "Required ARIA attribute not present: aria-checked", "relatedNodes": []}], "failureSummary": "Fix any of the following:
  Required ARIA attribute not present: aria-checked", "html": "<div aria-label=\"Implement mobile aut...\" role=\"checkbox\" tabindex=\"0\" class=\"css-view-g5y9jx r-tr...\" style=\"flex: 1 1 0%; transi...\">", "impact": "critical", "none": [], "target": [".css-view-g5y9jx:nth-child(3) > .r-borderBottomColor-1et0pir.r-borderBottomWidth-qklmqi[role=\"checkbox\"]"]}, {"all": [], "any": [{"data": ["aria-checked"], "id": "aria-required-attr", "impact": "critical", "message": "Required ARIA attribute not present: aria-checked", "relatedNodes": []}], "failureSummary": "Fix any of the following:
  Required ARIA attribute not present: aria-checked", "html": "<div aria-label=\"Configure local stor...\" role=\"checkbox\" tabindex=\"0\" class=\"css-view-g5y9jx r-tr...\" style=\"flex: 1 1 0%; transi...\">", "impact": "critical", "none": [], "target": [".css-view-g5y9jx:nth-child(4) > .r-borderBottomColor-1et0pir.r-borderBottomWidth-qklmqi[role=\"checkbox\"]"]}, {"all": [], "any": [{"data": ["aria-checked"], "id": "aria-required-attr", "impact": "critical", "message": "Required ARIA attribute not present: aria-checked", "relatedNodes": []}], "failureSummary": "Fix any of the following:
  Required ARIA attribute not present: aria-checked", "html": "<div aria-label=\"Run compilation test...\" role=\"checkbox\" tabindex=\"0\" class=\"css-view-g5y9jx r-tr...\" style=\"flex: 1 1 0%; transi...\">", "impact": "critical", "none": [], "target": ["div[aria-label=\"Run compilation tests\"]"]}], "tags": ["cat.aria", "wcag2a", "wcag412", "EN-301-549", "EN-9.4.1.2", "RGAAv4", "RGAA-7.1.1"]}, {"description": "Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds", "help": "Elements must meet minimum color contrast ratio thresholds", "helpUrl": "https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright", "id": "color-contrast", "impact": "serious", "nodes": [{"all": [], "any": [{"data": {"bgColor": "#17171a", "contrastRatio": 1.56, "expectedContrastRatio": "4.5:1", "fgColor": "#004411", "fontSize": "11.3pt (15px)", "fontWeight": "bold", "messageKey": null}, "id": "color-contrast", "impact": "serious", "message": "Element has insufficient color contrast of 1.56 (foreground color: #004411, background color: #17171a, font size: 11.3pt (15px), font weight: bold). Expected contrast ratio of 4.5:1", "relatedNodes": [{"html": "<div class=\"css-view-g5y9jx r-backgroundColor-1276npn r-borderColor-5vk2r4 r-borderRadius-kdyh1x r-borderWidth-rs99b7 r-padding-xyw6el\">", "target": [".r-borderColor-5vk2r4"]}, {"html": "<div class=\"css-view-g5y9jx r-paddingBottom-97e31f r-paddingLeft-bv2aro r-paddingRight-hxflta r-backgroundColor-1ejn4w2 r-flex-13awgt0 r-paddingTop-1ur9v65\">", "target": [".r-paddingBottom-97e31f"]}]}], "failureSummary": "Fix any of the following:
  Element has insufficient color contrast of 1.56 (foreground color: #004411, background color: #17171a, font size: 11.3pt (15px), font weight: bold). Expected contrast ratio of 4.5:1", "html": "<div dir=\"auto\" class=\"css-text-146c3p1 r-fontFamily-1pm8pkb r-fontSize-a023e6 r-fontWeight-vw2c0b r-marginRight-zso239\" style=\"color: rgb(0, 68, 17);\">[x]</div>", "impact": "serious", "none": [], "target": ["div[aria-label=\"Define remote database model\"] > .r-fontFamily-1pm8pkb.r-marginRight-zso239.r-fontSize-a023e6"]}, {"all": [], "any": [{"data": {"bgColor": "#17171a", "contrastRatio": 1.2, "expectedContrastRatio": "4.5:1", "fgColor": "#0c2e16", "fontSize": "11.3pt (15px)", "fontWeight": "normal", "messageKey": null}, "id": "color-contrast", "impact": "serious", "message": "Element has insufficient color contrast of 1.2 (foreground color: #0c2e16, background color: #17171a, font size: 11.3pt (15px), font weight: normal). Expected contrast ratio of 4.5:1", "relatedNodes": [{"html": "<div class=\"css-view-g5y9jx r-backgroundColor-1276npn r-borderColor-5vk2r4 r-borderRadius-kdyh1x r-borderWidth-rs99b7 r-padding-xyw6el\">", "target": [".r-borderColor-5vk2r4"]}, {"html": "<div class=\"css-view-g5y9jx r-paddingBottom-97e31f r-paddingLeft-bv2aro r-paddingRight-hxflta r-backgroundColor-1ejn4w2 r-flex-13awgt0 r-paddingTop-1ur9v65\">", "target": [".r-paddingBottom-97e31f"]}]}], "failureSummary": "Fix any of the following:
  Element has insufficient color contrast of 1.2 (foreground color: #0c2e16, background color: #17171a, font size: 11.3pt (15px), font weight: normal). Expected contrast ratio of 4.5:1", "html": "<div dir=\"auto\" class=\"css-text-146c3p1 r-flex-13awgt0 r-fontSize-a023e6 r-lineHeight-10yl4k r-opacity-icoktb r-textDecorationLine-142tt33\" style=\"color: rgb(0, 68, 17);\">Define remote database model</div>", "impact": "serious", "none": [], "target": [".r-opacity-icoktb"]}], "tags": ["cat.color", "wcag2aa", "wcag143", "TTv5", "TT13.c", "EN-301-549", "EN-9.1.4.3", "ACT", "RGAAv4", "RGAA-3.2.1"]}]
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
      - tab "Dashboard tab" [ref=e10] [cursor=pointer]:
        - generic [ref=e11]: 📊
        - generic [ref=e12]: Dashboard
      - tab "Plan tab" [ref=e13] [cursor=pointer]:
        - generic [ref=e14]: 📋
        - generic [ref=e15]: Plan
      - tab "Chat tab" [ref=e16] [cursor=pointer]:
        - generic [ref=e17]: 💬
        - generic [ref=e18]: Chat
      - tab "Tasks tab" [active] [ref=e19] [cursor=pointer]:
        - generic [ref=e20]: ✓
        - generic [ref=e21]: Tasks
      - tab "Settings tab" [ref=e23] [cursor=pointer]:
        - generic [ref=e24]: ⚙️
        - generic [ref=e25]: Settings
    - generic [ref=e29]:
      - generic [ref=e30]: PROJECT CHECKLIST
      - checkbox "Define remote database model" [ref=e32] [cursor=pointer]:
        - generic [ref=e33]: "[x]"
        - generic [ref=e34]: Define remote database model
      - generic [ref=e35]:
        - checkbox "Implement mobile auth socket hooks" [ref=e36] [cursor=pointer]:
          - generic [ref=e37]: "[/]"
          - generic [ref=e38]: Implement mobile auth socket hooks
        - button "Launch FORGE run for Implement mobile auth socket hooks" [ref=e39] [cursor=pointer]:
          - generic [ref=e40]: ▶ RUN
      - generic [ref=e41]:
        - checkbox "Configure local storage wrappers" [ref=e42] [cursor=pointer]:
          - generic [ref=e43]: "[ ]"
          - generic [ref=e44]: Configure local storage wrappers
        - button "Launch FORGE run for Configure local storage wrappers" [ref=e45] [cursor=pointer]:
          - generic [ref=e46]: ▶ RUN
      - generic [ref=e47]:
        - checkbox "Run compilation tests" [ref=e48] [cursor=pointer]:
          - generic [ref=e49]: "[ ]"
          - generic [ref=e50]: Run compilation tests
        - button "Launch FORGE run for Run compilation tests" [ref=e51] [cursor=pointer]:
          - generic [ref=e52]: ▶ RUN
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