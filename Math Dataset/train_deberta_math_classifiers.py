# train_deberta_math_classifiers.py
# Fine-tunes DeBERTa-v3-large to classify SUBJECT and LEVEL on a MATH-like dataset.
# It AUTO-DETECTS field names and falls back to folder names for subject.

import os, json, pathlib, random, re
import numpy as np
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple
from datasets import Dataset, DatasetDict
from transformers import (AutoTokenizer, AutoModelForSequenceClassification,
                          TrainingArguments, Trainer)
import evaluate
from sklearn.metrics import classification_report, confusion_matrix

# -------------------------
# Config
# -------------------------
DATA_ROOT = "MATH"      # change if your folder name is different
MODEL_NAME = "microsoft/deberta-v3-large"
MAX_LEN = 512
SEED = 42

SUBJECT_OUT = "cls-subject-deberta-v3-large"
LEVEL_OUT   = "cls-level-deberta-v3-large"

# -------------------------
# Utils
# -------------------------
def set_seed(seed=SEED):
    random.seed(seed); np.random.seed(seed); os.environ["PYTHONHASHSEED"]=str(seed)

CANDIDATE_PROBLEM_KEYS = ["problem", "prompt", "question", "text"]
CANDIDATE_SUBJECT_KEYS = ["type", "subject", "category", "topic"]
CANDIDATE_LEVEL_KEYS   = ["level", "difficulty", "difficulty_level", "difficultyLevel", "grade"]

LEVEL_RE = re.compile(r"(?:level\s*)?(\d+)", re.IGNORECASE)

def normalize_level(raw: str) -> str:
    if not raw: return "Level ?"
    m = LEVEL_RE.search(str(raw))
    return f"Level {m.group(1)}" if m else str(raw).strip()

def discover_jsons(root_dir: str, split: str) -> List[str]:
    base = pathlib.Path(root_dir) / split
    return [str(p) for p in base.rglob("*.json")]

def load_split_as_list(root_dir: str, split: str) -> List[Dict]:
    items = []
    for path in discover_jsons(root_dir, split):
        data = json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
        # Keep all original keys; we’ll detect names later
        data["_path"] = path
        # Also store subject_from_path (folder name under split/)
        try:
            subj_from_path = pathlib.Path(path).parent.name
        except Exception:
            subj_from_path = None
        data["_subject_from_path"] = subj_from_path
        items.append(data)
    return items

def make_hf_dataset(root_dir: str) -> DatasetDict:
    train = load_split_as_list(root_dir, "train")
    test  = load_split_as_list(root_dir, "test")
    if not train:
        raise RuntimeError(f"No JSON files found under {root_dir}/train")
    if not test:
        print(f"[warn] No files found under {root_dir}/test — using 10% of train as test.")
        n = max(1, int(0.1*len(train)))
        test, train = train[:n], train[n:]
    return DatasetDict({
        "train": Dataset.from_list(train),
        "test":  Dataset.from_list(test),
    })

@dataclass
class FieldMap:
    problem_key: str
    subject_key: Optional[str]  # can be None (fallback to folder)
    level_key: Optional[str]    # can be None (we’ll error if truly missing)

def detect_fields(ds: DatasetDict) -> FieldMap:
    cols = set(ds["train"].column_names)
    # problem key
    pk = next((k for k in CANDIDATE_PROBLEM_KEYS if k in cols and all(ds["train"][k])), None)
    if not pk:
        # try to guess the most text-like column
        pk = next((c for c in ds["train"].column_names if c.lower() in {"problem","prompt","question","text"}), None)
    if not pk:
        raise RuntimeError(f"Could not find a problem text column in {cols}")

    # subject key
    sk = next((k for k in CANDIDATE_SUBJECT_KEYS if k in cols), None)
    # level key
    lk = next((k for k in CANDIDATE_LEVEL_KEYS if k in cols), None)

    print(f"[detect] problem_key={pk}  subject_key={sk or 'FOLDER'}  level_key={lk or 'UNKNOWN'}")
    return FieldMap(problem_key=pk, subject_key=sk, level_key=lk)

def compute_subject_list(ds: DatasetDict, fm: FieldMap) -> Tuple[List[str], Dict[str,int]]:
    if fm.subject_key and fm.subject_key in ds["train"].column_names:
        subjects = sorted({ (s or "").strip() for s in ds["train"][fm.subject_key] if s is not None })
    else:
        # fallback: derive from folder: .../train/<SUBJECT>/file.json
        subjects = sorted({ pathlib.Path(p).parent.name for p in ds["train"]["_path"] })
    sub2id = {s:i for i,s in enumerate(subjects)}
    return subjects, sub2id

def compute_level_list(ds: DatasetDict, fm: FieldMap) -> Tuple[List[str], Dict[str,int]]:
    if not fm.level_key or fm.level_key not in ds["train"].column_names:
        # Try to infer from values in train if missing entirely -> bail with a clear error
        raise RuntimeError("Could not find a level/difficulty column. "
                           f"Available columns: {ds['train'].column_names}")
    levels = sorted({ normalize_level(v) for v in ds["train"][fm.level_key] })
    lvl2id = {l:i for i,l in enumerate(levels)}
    return levels, lvl2id

def compute_metrics_builder(id2label):
    acc = evaluate.load("accuracy")
    f1m = evaluate.load("f1")
    prec = evaluate.load("precision")
    rec  = evaluate.load("recall")
    def _cmp(eval_pred):
        logits, labels = eval_pred
        preds = np.argmax(logits, axis=-1)
        return {
            "accuracy": acc.compute(predictions=preds, references=labels)["accuracy"],
            "f1_macro": f1m.compute(average="macro", predictions=preds, references=labels)["f1"],
            "precision_macro": prec.compute(average="macro", predictions=preds, references=labels)["precision"],
            "recall_macro": rec.compute(average="macro", predictions=preds, references=labels)["recall"],
        }
    return _cmp

def report(model_dir, trainer, enc_ds, id2label, tag):
    preds = trainer.predict(enc_ds["test"])
    y_true = preds.label_ids
    y_pred = np.argmax(preds.predictions, axis=-1)
    print(f"\n=== {tag} test report ===")
    print(classification_report(y_true, y_pred, target_names=[id2label[i] for i in range(len(id2label))]))
    print("Confusion matrix:\n", confusion_matrix(y_true, y_pred))
    # Save predictions CSV
    import csv
    out_csv = pathlib.Path(model_dir)/"test_predictions.csv"
    out_csv.parent.mkdir(parents=True, exist_ok=True)
    with out_csv.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["path","pred","true"])
        for path, yp, yt in zip(enc_ds["test"]["_path"], y_pred, y_true):
            w.writerow([path, id2label[yp], id2label[yt]])
    print("Wrote:", out_csv)

# -------------------------
# Main
# -------------------------
def main():
    set_seed(SEED)
    print("Loading dataset from:", DATA_ROOT)
    ds = make_hf_dataset(DATA_ROOT)

    fm = detect_fields(ds)
    tok = AutoTokenizer.from_pretrained(MODEL_NAME)

    # ---------- SUBJECT ----------
    subjects, sub2id = compute_subject_list(ds, fm)
    id2sub = {v:k for k,v in sub2id.items()}
    print("Subjects:", subjects)

    def map_subject(ex):
        text = ex[fm.problem_key]
        d = tok(text, truncation=True, max_length=MAX_LEN)
        if fm.subject_key and fm.subject_key in ex and ex[fm.subject_key]:
            subj = (ex[fm.subject_key] or "").strip()
        else:
            # from folder
            subj = pathlib.Path(ex["_path"]).parent.name
        d["labels"] = sub2id[subj]
        # keep path so we can export per-file predictions later
        d["_path"] = ex["_path"]
        return d

    enc_sub = ds.map(map_subject, remove_columns=[c for c in ds["train"].column_names if c not in {fm.problem_key, fm.subject_key, "_path"}])
    model_sub = AutoModelForSequenceClassification.from_pretrained(
        MODEL_NAME, num_labels=len(subjects), label2id=sub2id, id2label=id2sub
    )
    args_sub = TrainingArguments(
        output_dir=SUBJECT_OUT,
        per_device_train_batch_size=32, per_device_eval_batch_size=64,
        learning_rate=2e-5, weight_decay=0.01, num_train_epochs=3,
        warmup_ratio=0.06, evaluation_strategy="epoch", save_strategy="epoch",
        logging_steps=50, fp16=True, report_to="none",
        load_best_model_at_end=True, metric_for_best_model="accuracy",
        greater_is_better=True, seed=SEED,
    )
    trainer_sub = Trainer(
        model=model_sub, args=args_sub,
        train_dataset=enc_sub["train"], eval_dataset=enc_sub["test"],
        tokenizer=tok, compute_metrics=compute_metrics_builder(id2sub),
    )
    print("\nTraining SUBJECT classifier…")
    trainer_sub.train()
    trainer_sub.save_model(SUBJECT_OUT)
    report(SUBJECT_OUT, trainer_sub, enc_sub, id2sub, tag="SUBJECT")

    # ---------- LEVEL ----------
    levels, lvl2id = compute_level_list(ds, fm)
    id2lvl = {v:k for k,v in lvl2id.items()}
    print("Levels:", levels)

    def map_level(ex):
        text = ex[fm.problem_key]
        d = tok(text, truncation=True, max_length=MAX_LEN)
        lvl = normalize_level(ex[fm.level_key]) if fm.level_key in ex else "Level ?"
        d["labels"] = lvl2id[lvl]
        d["_path"] = ex["_path"]
        return d

    enc_lvl = ds.map(map_level, remove_columns=[c for c in ds["train"].column_names if c not in {fm.problem_key, fm.level_key, "_path"}])
    model_lvl = AutoModelForSequenceClassification.from_pretrained(
        MODEL_NAME, num_labels=len(levels), label2id=lvl2id, id2label=id2lvl
    )
    args_lvl = TrainingArguments(
        output_dir=LEVEL_OUT,
        per_device_train_batch_size=32, per_device_eval_batch_size=64,
        learning_rate=2e-5, weight_decay=0.01, num_train_epochs=3,
        warmup_ratio=0.06, evaluation_strategy="epoch", save_strategy="epoch",
        logging_steps=50, fp16=True, report_to="none",
        load_best_model_at_end=True, metric_for_best_model="accuracy",
        greater_is_better=True, seed=SEED,
    )
    trainer_lvl = Trainer(
        model=model_lvl, args=args_lvl,
        train_dataset=enc_lvl["train"], eval_dataset=enc_lvl["test"],
        tokenizer=tok, compute_metrics=compute_metrics_builder(id2lvl),
    )
    print("\nTraining LEVEL classifier…")
    trainer_lvl.train()
    trainer_lvl.save_model(LEVEL_OUT)
    report(LEVEL_OUT, trainer_lvl, enc_lvl, id2lvl, tag="LEVEL")

    print("\nAll done. Saved models to:", SUBJECT_OUT, "and", LEVEL_OUT)

if __name__ == "__main__":
    main()
