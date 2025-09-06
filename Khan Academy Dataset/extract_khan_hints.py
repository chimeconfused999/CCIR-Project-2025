import json, re, sys
from pathlib import Path

IN  = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("khan_hints.jsonl")
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else IN.with_name(IN.stem + "_clean.jsonl")

def canon(s: str) -> str:
    # Remove templating helpers
    s = re.sub(r"plural_form\([^)]*\)", "units", s)
    s = s.replace("UNIT_TEXT", "units")
    s = s.replace("\\times", "×").replace("*", "×")

    # Normalize common variable placeholders:
    # S is usually a "side" in square/area templates; L/W are length/width.
    # Do careful word-boundary replacements to avoid touching words.
    s = re.sub(r"\bS\b", "side", s)
    s = re.sub(r"\bL\b", "length", s)
    s = re.sub(r"\bW\b", "width", s)

    # Tidy duplicated spaces and periods
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r"\s+\.", ".", s)
    return s

def keep_hint(h: str) -> bool:
    # Drop tiny or fragmentary hints
    if len(h) < 5: return False
    # Drop codey leftovers
    if re.search(r"(var\s+|function\s*\(|=>|return\s+|_[\.\(]|\{|\}|;)", h): return False
    return True

with IN.open("r", encoding="utf-8") as fin, OUT.open("w", encoding="utf-8") as fout:
    for line in fin:
        if not line.strip(): continue
        rec = json.loads(line)
        rec["problem"] = canon(rec.get("problem",""))
        clean_hints = []
        for h in rec.get("hints", []):
            h = canon(h)
            if keep_hint(h) and (not clean_hints or clean_hints[-1] != h):
                clean_hints.append(h)
        # Extra de-dupe across obvious near-duplicates
        rec["hints"] = []
        seen = set()
        for h in clean_hints:
            key = h.lower()
            if key not in seen:
                seen.add(key)
                rec["hints"].append(h)
        fout.write(json.dumps(rec, ensure_ascii=False) + "\n")

print(f"Saved cleaned file to: {OUT}")
