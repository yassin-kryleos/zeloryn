export interface RefinedPlanItem {
  title: string;
  status: 'Accepted' | 'Revised' | 'Flagged' | string;
  category: string;
  changes: string;
  criteriaHint: string;
}

/**
 * Parses assistant message containing CREW output format:
 * ### [ITEM] <title>
 * - Status: <status>
 * - Category: <category>
 * - Changes: <changes>
 * - Criteria hint: <criteriaHint>
 */
export function parseCrewItems(text: string): RefinedPlanItem[] {
  const items: RefinedPlanItem[] = [];
  // Split the text by '### [ITEM]'
  const parts = text.split(/###\s+\[ITEM\]/gi);
  
  // The first part is the header text before any ### [ITEM], skip it.
  for (let i = 1; i < parts.length; i++) {
    const block = parts[i];
    const lines = block.split('\n');
    if (lines.length === 0) continue;

    // The first line is the title of the item, e.g. " Authentication System"
    const title = lines[0].trim();
    if (!title) continue;

    let status = 'Accepted';
    let category = '';
    let changes = '';
    let criteriaHint = '';

    for (let j = 1; j < lines.length; j++) {
      const line = lines[j].trim();
      if (!line) continue;

      // Check if it's a field list item: - Status: ... or - Category: ... or * Status: ...
      const match = line.match(/^[-*]\s+([^:]+):\s*(.*)$/i);
      if (match) {
        const fieldName = match[1].trim().toLowerCase();
        const fieldValue = match[2].trim();

        if (fieldName === 'status') {
          status = fieldValue;
        } else if (fieldName === 'category') {
          category = fieldValue;
        } else if (fieldName === 'changes') {
          changes = fieldValue;
        } else if (fieldName === 'criteria hint' || fieldName === 'criteria_hint' || fieldName === 'criteria') {
          criteriaHint = fieldValue;
        }
      }
    }

    items.push({
      title,
      status,
      category,
      changes,
      criteriaHint
    });
  }

  return items;
}
