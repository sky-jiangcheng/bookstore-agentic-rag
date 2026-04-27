from __future__ import annotations

import argparse
import json
import math
import re
from pathlib import Path
from typing import Dict, Iterable, List, Optional

import pandas as pd
from docx import Document


SUBJECT_SPLIT_RE = re.compile(r"[\\/\|,，;；]+")
NON_DIGIT_RE = re.compile(r"\D+")
BARCODE_PATTERN = re.compile(r"^\d+(?:\.0)?$")
DESCRIPTION_MAX_CHARS = 200


def normalize_barcode(raw_value: object) -> Optional[int]:
    if raw_value is None:
        return None

    value = str(raw_value).strip()
    if not value or value.lower() == "nan":
        return None

    if value.endswith(".0"):
        value = value[:-2]

    if not BARCODE_PATTERN.fullmatch(value):
        return None

    digits_only = NON_DIGIT_RE.sub("", value)
    if not digits_only:
        return None

    try:
        return int(digits_only)
    except ValueError:
        return None


def normalize_text(value: object) -> str:
    if value is None:
        return ""

    text = str(value).strip()
    return "" if text.lower() == "nan" else text


def normalize_float(value: object) -> Optional[float]:
    if value is None:
        return None

    if isinstance(value, float) and math.isnan(value):
        return None

    text = normalize_text(value)
    if not text:
        return None

    try:
        return float(text)
    except ValueError:
        return None


def normalize_int(value: object) -> int:
    number = normalize_float(value)
    return int(number) if number is not None else 0


def pick_category(subject: object, classification: object) -> str:
    subject_text = normalize_text(subject)
    if subject_text:
        parts = [part.strip() for part in SUBJECT_SPLIT_RE.split(subject_text) if part.strip()]
        if parts:
            return parts[0][:100]

    classification_text = normalize_text(classification)
    return classification_text[:100] if classification_text else "general"


def normalize_book_row(row: dict, priority: int) -> Optional[dict]:
    book_id = normalize_barcode(
        row.get("条码") or row.get("barcode") or row.get("ISBN") or row.get("isbn")
    )
    title = normalize_text(row.get("书名") or row.get("title"))
    if book_id is None or not title:
        return None

    full_description = normalize_text(row.get("内容简介") or row.get("简介") or row.get("description"))
    vector_text = "\n".join(
        part
        for part in [
            f"Title: {title}",
            f"Author: {normalize_text(row.get('作者') or row.get('author'))}",
            f"Publisher: {normalize_text(row.get('出版社') or row.get('publisher'))}",
            f"Category: {pick_category(row.get('主题词'), row.get('中图法') or row.get('中图分类'))}",
            f"Keywords: {normalize_text(row.get('主题词'))}",
            f"Description: {full_description}",
        ]
        if part and not part.endswith(": ")
    )

    return {
        "id": str(book_id),
        "title": title[:255],
        "author": normalize_text(row.get("作者") or row.get("author"))[:255] or None,
        "publisher": normalize_text(row.get("出版社") or row.get("publisher"))[:255] or None,
        "price": normalize_float(row.get("定价") or row.get("price")),
        "stock": normalize_int(row.get("库存") or row.get("stock")),
        "category": pick_category(row.get("主题词"), row.get("中图法") or row.get("中图分类")),
        "description": full_description[:DESCRIPTION_MAX_CHARS],
        "vector_text": vector_text,
        "cover_url": None,
        "popularity_score": normalize_int(row.get("库存") or row.get("stock")),
        "_priority": priority,
    }


def merge_book_records(records: List[dict]) -> dict:
    ordered = sorted(records, key=lambda item: item["_priority"])
    merged = ordered[0].copy()

    for record in ordered[1:]:
        for field in ("publisher", "author", "description", "category", "vector_text"):
            if not merged.get(field) and record.get(field):
                merged[field] = record[field]

        if (merged.get("stock") or 0) == 0 and (record.get("stock") or 0) > 0:
            merged["stock"] = record["stock"]

        if merged.get("price") is None and record.get("price") is not None:
            merged["price"] = record["price"]

        if (merged.get("popularity_score") or 0) == 0 and (record.get("popularity_score") or 0) > 0:
            merged["popularity_score"] = record["popularity_score"]

    merged.pop("_priority", None)
    return merged


def _is_heading(paragraph: str) -> bool:
    compact = paragraph.replace(" ", "")
    return (
        bool(compact)
        and compact == paragraph
        and len(compact) <= 8
        and not re.search(r"[0-9,，;；\\]", compact)
    )


def split_keywords(text: str) -> List[str]:
    parts = [part.strip("()（）[]【】,.，;；") for part in text.split()]
    return [part for part in parts if part]


def parse_filter_paragraphs(paragraphs: Iterable[str]) -> Dict[str, str]:
    keyword_to_category: Dict[str, str] = {}
    current_category: Optional[str] = None

    for paragraph in paragraphs:
        text = normalize_text(paragraph)
        if not text or text == "需要排除的带关键词的图书":
            continue

        if _is_heading(text):
            current_category = text
            continue

        if not current_category:
            continue

        for keyword in split_keywords(text):
            keyword_to_category.setdefault(keyword[:128], current_category[:128])

    return keyword_to_category


def load_books_from_excel(path: Path, priority: int) -> List[dict]:
    frame = pd.read_excel(path, sheet_name=0)
    records: List[dict] = []

    for row in frame.to_dict(orient="records"):
        normalized = normalize_book_row(row, priority)
        if normalized:
            records.append(normalized)

    return records


def prepare_books(main_path: Path, supplement_paths: List[Path]) -> List[dict]:
    merged_by_id: Dict[int, List[dict]] = {}

    for path, priority in [(main_path, 0), *[(supplement, index + 1) for index, supplement in enumerate(supplement_paths)]]:
        for record in load_books_from_excel(path, priority):
            merged_by_id.setdefault(record["id"], []).append(record)

    merged = [merge_book_records(records) for records in merged_by_id.values()]
    merged.sort(key=lambda item: item["id"])
    return merged


def prepare_filter_keywords(doc_path: Path) -> List[dict]:
    document = Document(doc_path)
    paragraphs = [paragraph.text for paragraph in document.paragraphs]
    keyword_map = parse_filter_paragraphs(paragraphs)

    rows = [
        {
            "keyword": keyword,
            "category": category,
            "is_active": True,
        }
        for keyword, category in sorted(keyword_map.items())
    ]
    return rows


def write_ndjson(rows: Iterable[dict], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False))
            handle.write("\n")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Prepare Huqifeng bookstore data for production import.")
    parser.add_argument("--main-books", required=True, type=Path)
    parser.add_argument("--supplement-books", action="append", default=[], type=Path)
    parser.add_argument("--filter-doc", required=True, type=Path)
    parser.add_argument("--books-out", required=True, type=Path)
    parser.add_argument("--filters-out", required=True, type=Path)
    return parser


def main() -> None:
    args = build_parser().parse_args()
    books = prepare_books(args.main_books, args.supplement_books)
    filters = prepare_filter_keywords(args.filter_doc)

    write_ndjson(books, args.books_out)
    write_ndjson(filters, args.filters_out)

    print(json.dumps({"books": len(books), "filters": len(filters)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
