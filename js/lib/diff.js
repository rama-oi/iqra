// Turns the text of a unified diff (what `git diff` prints) into hunks of lines.
//   hunk: { header, lines: [{ type: "add" | "del" | "ctx" | "note", oldNo, newNo, text }] }
// Everything before the first "@@" (diff --git, index, ---, +++) is skipped; the
// file name and status come from the API, not from the patch.
const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

export function parseUnifiedDiff(patch) {
  const hunks = [];
  let hunk = null;
  let oldNo = 0;
  let newNo = 0;

  for (const line of String(patch ?? "").split("\n")) {
    const start = HUNK.exec(line);
    if (start) {
      oldNo = Number(start[1]);
      newNo = Number(start[2]);
      hunk = { header: line, lines: [] };
      hunks.push(hunk);
      continue;
    }
    if (!hunk || line === "") continue;

    const text = line.slice(1);
    switch (line[0]) {
      case "+":
        hunk.lines.push({ type: "add", oldNo: null, newNo: newNo++, text });
        break;
      case "-":
        hunk.lines.push({ type: "del", oldNo: oldNo++, newNo: null, text });
        break;
      case " ":
        hunk.lines.push({ type: "ctx", oldNo: oldNo++, newNo: newNo++, text });
        break;
      case "\\": // "\ No newline at end of file"
        hunk.lines.push({ type: "note", oldNo: null, newNo: null, text: line.slice(2) });
        break;
    }
  }
  return hunks;
}
