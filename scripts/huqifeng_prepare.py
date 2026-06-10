from __future__ import annotations

import argparse
import datetime
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
PUBLICATION_YEAR_PATTERN = re.compile(r"(?<!\d)(19\d{2}|20\d{2}|2100)(?!\d)")


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


def normalize_publication_year(value: object) -> Optional[int]:
    if value is None:
        return None

    if isinstance(value, (datetime.date, datetime.datetime, pd.Timestamp)):
        year = value.year
        return year if 1900 <= year <= 2100 else None

    text = normalize_text(value)
    if not text:
        return None

    match = PUBLICATION_YEAR_PATTERN.search(text)
    if not match:
        return None

    year = int(match.group(1))
    return year if 1900 <= year <= 2100 else None


def pick_category(subject: object, classification: object) -> str:
    subject_text = normalize_text(subject)
    if subject_text:
        parts = [part.strip() for part in SUBJECT_SPLIT_RE.split(subject_text) if part.strip()]
        if parts:
            return parts[0][:100]

    classification_text = normalize_text(classification)
    return classification_text[:100] if classification_text else "general"


def parse_age_range(subject: object) -> tuple[Optional[int], Optional[int]]:
    subject_text = normalize_text(subject)
    if not subject_text:
        return None, None
    
    # Match patterns like "7-10岁", "7-10", "3 - 6 岁"
    match = re.search(r"(\d+)\s*[-－~\s]\s*(\d+)\s*(?:岁|years|yr)?", subject_text)
    if match:
        try:
            return int(match.group(1)), int(match.group(2))
        except ValueError:
            pass
            
    # Match patterns like "7岁+", "7+"
    match_single = re.search(r"(\d+)\s*(?:岁|years|yr)?\s*\+", subject_text)
    if match_single:
        try:
            return int(match_single.group(1)), None
        except ValueError:
            pass
            
    # Match patterns like "7岁"
    match_single_only = re.search(r"(\d+)\s*岁", subject_text)
    if match_single_only:
        try:
            val = int(match_single_only.group(1))
            return val, val
        except ValueError:
            pass
            
    return None, None


def normalize_book_row(row: dict, priority: int) -> Optional[dict]:
    book_id = normalize_barcode(
        row.get("条码") or row.get("barcode") or row.get("ISBN") or row.get("isbn")
    )
    title = normalize_text(row.get("书名") or row.get("title"))
    if book_id is None or not title:
        return None

    full_description = normalize_text(row.get("内容简介") or row.get("简介") or row.get("description"))
    clc_code = normalize_text(row.get("中图法") or row.get("中图分类"))[:50] or None
    age_min, age_max = parse_age_range(row.get("主题词"))
    
    return {
        "id": str(book_id),
        "title": title[:255],
        "author": normalize_text(row.get("author") or row.get("作者"))[:255] or None,
        "publisher": normalize_text(row.get("publisher") or row.get("出版社"))[:255] or None,
        "publication_year": normalize_publication_year(
            row.get("出版时间")
            or row.get("出版日期")
            or row.get("出版年")
            or row.get("publication_year")
        ),
        "price": normalize_float(row.get("定价") or row.get("price")),
        "stock": normalize_int(row.get("库存") or row.get("stock")),
        "category": pick_category(row.get("主题词"), row.get("中图法") or row.get("中图分类")),
        "description": full_description[:DESCRIPTION_MAX_CHARS],
        "cover_url": None,
        "popularity_score": normalize_int(row.get("库存") or row.get("stock")),
        "clc_code": clc_code,
        "age_min": age_min,
        "age_max": age_max,
        "_priority": priority,
    }


def merge_book_records(records: List[dict]) -> dict:
    ordered = sorted(records, key=lambda item: item["_priority"])
    merged = ordered[0].copy()

    for record in ordered[1:]:
        for field in ("publisher", "author", "description", "category", "publication_year", "clc_code", "age_min", "age_max"):
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


def parse_filter_paragraphs(paragraphs: Iterable[str]) -> List[tuple[str, str]]:
    keyword_and_categories: set[tuple[str, str]] = set()
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
            keyword_and_categories.add((keyword[:128], current_category[:128]))

    return sorted(list(keyword_and_categories))


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


def is_chinese_char(c: str) -> bool:
    return "\u4e00" <= c <= "\u9fff"


def should_merge_paragraphs(p1_raw: str, p2_raw: str) -> bool:
    p1 = p1_raw.strip()
    p2 = p2_raw.strip()
    if not p1 or not p2:
        return False

    tokens1 = p1.split()
    tokens2 = p2.split()
    if not tokens1 or not tokens2:
        return False

    last_token = tokens1[-1]
    first_token = tokens2[0]

    is_last_single_cn = len(last_token) == 1 and is_chinese_char(last_token)
    is_first_single_cn = len(first_token) == 1 and is_chinese_char(first_token)

    if (is_last_single_cn or is_first_single_cn) and is_chinese_char(last_token[-1]) and is_chinese_char(first_token[0]):
        if not p1_raw.endswith(" ") and not p2_raw.startswith(" "):
            return True

    return False


def prepare_filter_keywords(doc_path: Path) -> List[dict]:
    document = Document(doc_path)
    raw_paragraphs = [paragraph.text for paragraph in document.paragraphs]

    processed_paragraphs = []
    i = 0
    while i < len(raw_paragraphs):
        p_text = raw_paragraphs[i].strip()
        if not p_text:
            i += 1
            continue

        while i + 1 < len(raw_paragraphs):
            next_text = raw_paragraphs[i+1].strip()
            if not next_text:
                break

            if _is_heading(p_text) or _is_heading(next_text):
                break

            if should_merge_paragraphs(raw_paragraphs[i], raw_paragraphs[i+1]):
                p_text = p_text + next_text
                raw_paragraphs[i] = raw_paragraphs[i] + raw_paragraphs[i+1]
                i += 1
            else:
                break

        processed_paragraphs.append(p_text)
        i += 1

    keyword_pairs = parse_filter_paragraphs(processed_paragraphs)

    rows = [
        {
            "keyword": keyword,
            "category": category,
            "is_active": True,
        }
        for keyword, category in keyword_pairs
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
