import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const BLOCKING = new Set(['critical', 'serious']);
for (const theme of ['light', 'matrix', 'forge']) {
  for (const tab of ['Overview', 'Planning tab', 'Tutorial tab', 'Downloads tab', 'Settings tab']) {
    test(`${theme} / ${tab} contrast`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('web_theme', t), theme);
      await page.goto('/');
      if (tab !== 'Overview') await page.getByRole('tab', { name: tab }).click();
      const r = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
      const blocking = r.violations.filter(v => BLOCKING.has(v.impact ?? ''));
      if (r.violations.length) console.log(`[${theme}/${tab}]`, r.violations.map(v=>`${v.impact}:${v.id}(${v.nodes.length})`).join(', '));
      expect(blocking, JSON.stringify(blocking.map(b=>({id:b.id,nodes:b.nodes.map(n=>n.html)})),null,2)).toEqual([]);
    });
  }
}
