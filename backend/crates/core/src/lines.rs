//! Staging and unstaging single lines of a file.
//!
//! The browser says which changed lines it wants; the patch to apply is built here from a
//! fresh diff, never taken from the browser, and handed to `git apply --cached`.

use std::collections::HashSet;
use std::path::Path;

use crate::{Error, Result, cli};

struct Hunk<'a> {
    old_start: usize,
    new_start: usize,
    tail: &'a str,
    body: Vec<&'a str>,
}

fn parse_header(line: &str) -> Option<(usize, usize, &str)> {
    let rest = line.strip_prefix("@@ -")?;
    let (ranges, tail) = rest.split_once(" @@")?;
    let (old, new) = ranges.split_once(" +")?;
    let start = |r: &str| r.split(',').next()?.parse().ok();
    Some((start(old)?, start(new)?, tail))
}

/// Number of changed (+ or -) lines in a patch: the indexes the browser can pick from.
pub fn changed_lines(patch: &str) -> usize {
    patch
        .lines()
        .skip_while(|l| !l.starts_with("@@"))
        .filter(|l| l.starts_with('+') || l.starts_with('-'))
        .count()
}

/// The patch that holds only the chosen changed lines (counted from 0 over all hunks).
///
/// `unstage` is for a staged diff that will be applied in reverse: lines left out stay
/// staged, so they become context. For an unstaged diff applied forward, lines left out
/// stay as they are in the index.
pub fn subset_patch(patch: &str, selected: &HashSet<usize>, unstage: bool) -> Result<String> {
    let mut lines = patch.split('\n');
    let mut header = String::new();
    let mut hunks: Vec<Hunk> = Vec::new();
    for line in lines.by_ref() {
        if let Some((old_start, new_start, tail)) = parse_header(line) {
            hunks.push(Hunk { old_start, new_start, tail, body: Vec::new() });
            break;
        }
        header.push_str(line);
        header.push('\n');
    }
    for line in lines {
        if let Some((old_start, new_start, tail)) = parse_header(line) {
            hunks.push(Hunk { old_start, new_start, tail, body: Vec::new() });
        } else if let Some(h) = hunks.last_mut()
            && !line.is_empty()
        {
            h.body.push(line);
        }
    }
    if hunks.is_empty() {
        return Err(Error::Invalid("There is nothing to pick lines from.".into()));
    }
    let total = changed_lines(patch);
    if let Some(bad) = selected.iter().find(|i| **i >= total) {
        return Err(Error::Invalid(format!("There is no changed line {bad}.")));
    }

    let mut out = header;
    let mut index = 0;
    let mut any = false;
    for h in &hunks {
        let mut body: Vec<String> = Vec::new();
        let (mut old, mut new) = (0, 0);
        let mut changes = false;
        let mut last_kept = false;
        for line in &h.body {
            let (sign, text) = line.split_at(1);
            match sign {
                " " => {
                    body.push((*line).to_string());
                    old += 1;
                    new += 1;
                    last_kept = true;
                }
                "+" | "-" => {
                    let chosen = selected.contains(&index);
                    index += 1;
                    let added = sign == "+";
                    if chosen {
                        body.push((*line).to_string());
                        changes = true;
                        last_kept = true;
                        if added { new += 1 } else { old += 1 }
                    } else if added == unstage {
                        // a line that is still there on the side the patch is applied to
                        body.push(format!(" {text}"));
                        old += 1;
                        new += 1;
                        last_kept = true;
                    } else {
                        last_kept = false;
                    }
                }
                "\\" => {
                    if last_kept {
                        body.push((*line).to_string());
                    }
                }
                _ => {}
            }
        }
        if !changes {
            continue;
        }
        any = true;
        out.push_str(&format!("@@ -{},{} +{},{} @@{}\n", h.old_start, old, h.new_start, new, h.tail));
        for l in body {
            out.push_str(&l);
            out.push('\n');
        }
    }
    if !any {
        return Err(Error::Invalid("Select at least one changed line.".into()));
    }
    Ok(out)
}

/// Stages (or, with `unstage`, takes out of the index) just the chosen lines of a file.
pub fn apply_lines(repo: &Path, patch: &str, selected: &HashSet<usize>, unstage: bool) -> Result<()> {
    let subset = subset_patch(patch, selected, unstage)?;
    cli::apply_to_index(repo, &subset, unstage)
}

#[cfg(test)]
mod tests {
    use super::*;

    const PATCH: &str = "diff --git a/f b/f\nindex 1..2 100644\n--- a/f\n+++ b/f\n@@ -1,3 +1,4 @@\n a\n-b\n+B\n+C\n c\n";

    fn pick(ix: &[usize], unstage: bool) -> String {
        subset_patch(PATCH, &ix.iter().copied().collect(), unstage).unwrap()
    }

    #[test]
    fn staging_keeps_unpicked_removals_as_context_and_drops_unpicked_additions() {
        let p = pick(&[1], false); // only "+B"
        assert!(p.contains("@@ -1,3 +1,4 @@\n a\n b\n+B\n c\n"), "{p}");
    }

    #[test]
    fn unstaging_keeps_unpicked_additions_as_context_and_drops_unpicked_removals() {
        let p = pick(&[2], true); // only "+C" taken out
        assert!(p.contains("@@ -1,3 +1,4 @@\n a\n B\n+C\n c\n"), "{p}");
    }

    #[test]
    fn all_lines_give_the_whole_hunk_and_none_is_refused() {
        assert!(pick(&[0, 1, 2], false).contains("@@ -1,3 +1,4 @@\n a\n-b\n+B\n+C\n c\n"));
        assert!(subset_patch(PATCH, &HashSet::new(), false).is_err());
        assert!(subset_patch(PATCH, &[9].into_iter().collect(), false).is_err());
    }
}
