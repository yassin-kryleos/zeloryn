interface MatchBlock {
  oldStart: number;
  newStart: number;
  length: number;
}

function findMatches(
  oldLines: string[],
  newLines: string[],
  oldStart = 0,
  oldEnd = oldLines.length,
  newStart = 0,
  newEnd = newLines.length
): MatchBlock[] {
  let maxLen = 0;
  let maxOld = 0;
  let maxNew = 0;

  for (let i = oldStart; i < oldEnd; i++) {
    for (let j = newStart; j < newEnd; j++) {
      let len = 0;
      while (
        i + len < oldEnd &&
        j + len < newEnd &&
        oldLines[i + len] === newLines[j + len]
      ) {
        len++;
      }
      if (len > maxLen) {
        maxLen = len;
        maxOld = i;
        maxNew = j;
      }
    }
  }

  if (maxLen === 0) return [];

  const matches: MatchBlock[] = [];
  matches.push(
    ...findMatches(oldLines, newLines, oldStart, maxOld, newStart, maxNew)
  );
  matches.push({ oldStart: maxOld, newStart: maxNew, length: maxLen });
  matches.push(
    ...findMatches(
      oldLines,
      newLines,
      maxOld + maxLen,
      oldEnd,
      maxNew + maxLen,
      newEnd
    )
  );

  return matches;
}

export interface Edit {
  start: number;
  end: number;
  lines: string[];
}

export function getEdits(oldLines: string[], newLines: string[]): Edit[] {
  const matches = findMatches(oldLines, newLines);
  const edits: Edit[] = [];
  let lastOldEnd = 0;
  let lastNewEnd = 0;

  for (const match of matches) {
    if (match.oldStart > lastOldEnd || match.newStart > lastNewEnd) {
      edits.push({
        start: lastOldEnd,
        end: match.oldStart,
        lines: newLines.slice(lastNewEnd, match.newStart),
      });
    }
    lastOldEnd = match.oldStart + match.length;
    lastNewEnd = match.newStart + match.length;
  }

  if (lastOldEnd < oldLines.length || lastNewEnd < newLines.length) {
    edits.push({
      start: lastOldEnd,
      end: oldLines.length,
      lines: newLines.slice(lastNewEnd, newLines.length),
    });
  }

  return edits;
}

export function getReplacedLines(
  baseLines: string[],
  edits: Edit[],
  start: number,
  end: number
): string[] {
  const sortedEdits = [...edits].sort((a, b) => a.start - b.start);
  const lines: string[] = [];
  let curr = start;
  for (const edit of sortedEdits) {
    if (edit.end < start || edit.start > end) continue;
    if (edit.start > curr) {
      lines.push(...baseLines.slice(curr, edit.start));
    }
    lines.push(...edit.lines);
    curr = edit.end;
  }
  if (curr < end) {
    lines.push(...baseLines.slice(curr, end));
  }
  return lines;
}

export interface MergeResult {
  merged: string;
  hasConflicts: boolean;
}

export function threeWayMerge(
  base: string,
  ours: string,
  theirs: string
): MergeResult {
  if (ours === theirs) return { merged: ours, hasConflicts: false };
  if (base === ours) return { merged: theirs, hasConflicts: false };
  if (base === theirs) return { merged: ours, hasConflicts: false };

  const baseLines = base.split(/\r?\n/);
  const oursLines = ours.split(/\r?\n/);
  const theirsLines = theirs.split(/\r?\n/);

  const oursEdits = getEdits(baseLines, oursLines);
  const theirsEdits = getEdits(baseLines, theirsLines);

  interface TaggedEdit extends Edit {
    source: 'ours' | 'theirs';
  }

  const combinedEdits: TaggedEdit[] = [
    ...oursEdits.map((e) => ({ ...e, source: 'ours' as const })),
    ...theirsEdits.map((e) => ({ ...e, source: 'theirs' as const })),
  ];

  combinedEdits.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return b.end - a.end;
  });

  interface EditGroup {
    start: number;
    end: number;
    edits: TaggedEdit[];
  }

  const groups: EditGroup[] = [];
  for (const edit of combinedEdits) {
    let merged = false;
    for (const group of groups) {
      const maxStart = Math.max(group.start, edit.start);
      const minEnd = Math.min(group.end, edit.end);
      if (
        maxStart <= minEnd ||
        (group.start === edit.start && group.end === edit.end)
      ) {
        group.start = Math.min(group.start, edit.start);
        group.end = Math.max(group.end, edit.end);
        group.edits.push(edit);
        merged = true;
        break;
      }
    }
    if (!merged) {
      groups.push({
        start: edit.start,
        end: edit.end,
        edits: [edit],
      });
    }
  }

  groups.sort((a, b) => a.start - b.start);

  const finalGroups: EditGroup[] = [];
  for (const group of groups) {
    if (finalGroups.length === 0) {
      finalGroups.push(group);
    } else {
      const last = finalGroups[finalGroups.length - 1];
      if (group.start <= last.end) {
        last.end = Math.max(last.end, group.end);
        last.edits.push(...group.edits);
      } else {
        finalGroups.push(group);
      }
    }
  }

  const mergedLines: string[] = [];
  let curr = 0;
  let hasConflicts = false;

  for (const group of finalGroups) {
    if (group.start > curr) {
      mergedLines.push(...baseLines.slice(curr, group.start));
    }

    const oursGroupEdits = group.edits.filter((e) => e.source === 'ours');
    const theirsGroupEdits = group.edits.filter((e) => e.source === 'theirs');

    const oursMerged = getReplacedLines(
      baseLines,
      oursGroupEdits,
      group.start,
      group.end
    );
    const theirsMerged = getReplacedLines(
      baseLines,
      theirsGroupEdits,
      group.start,
      group.end
    );

    if (theirsGroupEdits.length === 0) {
      mergedLines.push(...oursMerged);
    } else if (oursGroupEdits.length === 0) {
      mergedLines.push(...theirsMerged);
    } else {
      const oursStr = oursMerged.join('\n');
      const theirsStr = theirsMerged.join('\n');
      if (oursStr === theirsStr) {
        mergedLines.push(...oursMerged);
      } else {
        hasConflicts = true;
        mergedLines.push('<<<<<<< CLIENT (OURS)');
        if (oursStr) mergedLines.push(...oursMerged);
        mergedLines.push('=======');
        if (theirsStr) mergedLines.push(...theirsMerged);
        mergedLines.push('>>>>>>> SERVER (THEIRS)');
      }
    }

    curr = group.end;
  }

  if (curr < baseLines.length) {
    mergedLines.push(...baseLines.slice(curr));
  }

  return {
    merged: mergedLines.join('\n'),
    hasConflicts,
  };
}
