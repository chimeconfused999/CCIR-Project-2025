from pathlib import Path
from bs4 import BeautifulSoup
import json, re

root = Path("khan-exercises/exercises")
out = open("khan_hints.jsonl", "w", encoding="utf-8")

def clean(x):
    # keep math TeX text; strip excessive whitespace
    return re.sub(r"\s+", " ", x).strip()

for html_file in root.glob("*.html"):
    soup = BeautifulSoup(html_file.read_text(encoding="utf-8"), "html.parser")

    # The stem often lives in .problem, .question, or #workarea descendants
    stem = soup.select_one(".problem, .question, #workarea")
    stem_text = clean(stem.get_text(" ")) if stem else None

    # Hints are <div class="hint">...</div>, possibly containing multiple <p> steps or TeX
    hint_divs = soup.select("div.hint")
    hints = []
    for h in hint_divs:
        # explode multi-paragraph hints into separate steps
        parts = [clean(p.get_text(" ")) for p in h.find_all(["p","li","div"]) if clean(p.get_text(" "))]
        # fall back to whole block if no child paragraphs
        if not parts:
            parts = [clean(h.get_text(" "))]
        hints.extend([p for p in parts if p])

    # (Optional) extract correct answer if present (varies by exercise)
    # Many KA legacy items compute answers in JS; you may skip or mark unknown.
    if stem_text and hints:
        rec = {
            "id": f"{html_file.stem}",
            "source_file": str(html_file),
            "problem": stem_text,
            "hints": hints,              # ordered, early -> late
            "answer": None               # keep None unless confidently parsed
        }
        out.write(json.dumps(rec, ensure_ascii=False) + "\n")

out.close()
