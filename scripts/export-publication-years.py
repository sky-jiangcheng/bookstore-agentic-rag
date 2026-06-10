from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Dict, List

import pandas as pd

from huqifeng_prepare import normalize_barcode, normalize_publication_year

BIGINT_MAX = 9223372036854775807


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export merged book publication years as NDJSON.")
    parser.add_argument("--main-books", type=Path, required=True)
    parser.add_argument("--supplement-books", type=Path, action="append", default=[])
    parser.add_argument("--out", type=Path, required=True)
    return parser.parse_args()


def read_publication_years(path: Path) -> Dict[str, int]:
    frame = pd.read_excel(path, sheet_name=0)
    years: Dict[str, int] = {}

    for row in frame.to_dict(orient="records"):
        book_id = normalize_barcode(
            row.get("条码") or row.get("barcode") or row.get("ISBN") or row.get("isbn")
        )
        year = normalize_publication_year(
            row.get("出版时间")
            or row.get("出版日期")
            or row.get("出版年")
            or row.get("publication_year")
        )
        if book_id is not None and book_id <= BIGINT_MAX and year is not None:
            years[str(book_id)] = year

    return years


def merge_publication_years(main_path: Path, supplement_paths: List[Path]) -> Dict[str, int]:
    merged = read_publication_years(main_path)
    for path in supplement_paths:
        for book_id, year in read_publication_years(path).items():
            merged.setdefault(book_id, year)
    return merged


def main() -> None:
    args = parse_args()
    years = merge_publication_years(args.main_books, args.supplement_books)
    args.out.parent.mkdir(parents=True, exist_ok=True)

    with args.out.open("w", encoding="utf-8") as output:
        for book_id in sorted(years, key=int):
            output.write(
                json.dumps(
                    {"id": book_id, "publication_year": years[book_id]},
                    ensure_ascii=False,
                    separators=(",", ":"),
                )
                + "\n"
            )

    print(f"Exported {len(years)} publication years to {args.out}")


if __name__ == "__main__":
    main()
