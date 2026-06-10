import unittest
from datetime import datetime

from scripts.huqifeng_prepare import (
    merge_book_records,
    normalize_barcode,
    normalize_book_row,
    normalize_publication_year,
    parse_filter_paragraphs,
    format_book_category,
    parse_age_range,
)


class NormalizeBarcodeTests(unittest.TestCase):
    def test_normalize_barcode_strips_decimal_suffix(self):
        self.assertEqual(normalize_barcode("9787545144246.0"), 9787545144246)

    def test_normalize_barcode_rejects_non_digits(self):
        self.assertIsNone(normalize_barcode("ABC-123"))


class AgeRangeParsingTests(unittest.TestCase):
    def test_parse_age_range_hyphenated(self):
        self.assertEqual(parse_age_range("儿童绘本/7-10岁/科幻"), (7, 10))
        self.assertEqual(parse_age_range("3 - 6 岁"), (3, 6))
        self.assertEqual(parse_age_range("11-14"), (11, 14))

    def test_parse_age_range_plus_suffix(self):
        self.assertEqual(parse_age_range("少儿故事/7岁+/拼音"), (7, None))
        self.assertEqual(parse_age_range("12+"), (12, None))

    def test_parse_age_range_single_age(self):
        self.assertEqual(parse_age_range("适合7岁"), (7, 7))

    def test_parse_age_range_empty_or_invalid(self):
        self.assertEqual(parse_age_range(""), (None, None))
        self.assertEqual(parse_age_range(None), (None, None))
        self.assertEqual(parse_age_range("儿童文学"), (None, None))


class CategoryTests(unittest.TestCase):
    def test_format_book_category_prefers_subject_keyword(self):
        self.assertEqual(
            format_book_category("思维心理学\\通俗读物", "B842.5"),
            "/思维心理学/通俗读物/",
        )

    def test_format_book_category_falls_back_to_classification(self):
        self.assertEqual(format_book_category("", "D0"), "/D0/")


class MergeBookRecordsTests(unittest.TestCase):
    def test_normalize_publication_year_accepts_supported_source_formats(self):
        self.assertEqual(normalize_publication_year("2019"), 2019)
        self.assertEqual(normalize_publication_year("2023-07-01"), 2023)
        self.assertEqual(normalize_publication_year(datetime(2024, 5, 1)), 2024)
        self.assertIsNone(normalize_publication_year(""))
        self.assertIsNone(normalize_publication_year("出版时间不详"))
        self.assertIsNone(normalize_publication_year("2222-02-02"))
        self.assertIsNone(normalize_publication_year("编号2202301"))

    def test_normalize_book_row_extracts_new_fields(self):
        row = normalize_book_row(
            {
                "条码": "9787545144246",
                "书名": "主数据标题",
                "出版时间": "2024-03",
                "内容简介": "甲" * 260,
                "主题词": "思维心理学/7-10岁",
                "中图分类": "B84-05",
            },
            priority=0,
        )

        self.assertEqual(row["id"], "9787545144246")
        self.assertEqual(len(row["description"]), 200)
        self.assertEqual(row["publication_year"], 2024)
        self.assertEqual(row["clc_code"], "B84-05")
        self.assertEqual(row["age_min"], 7)
        self.assertEqual(row["age_max"], 10)

    def test_merge_prefers_main_record_and_fills_missing_from_supplement(self):
        merged = merge_book_records(
            [
                {
                    "id": 9787545144246,
                    "title": "主数据标题",
                    "author": "主作者",
                    "publisher": "",
                    "price": 68.0,
                    "stock": 0,
                    "category": "思维心理学",
                    "description": "主简介",
                    "publication_year": None,
                    "cover_url": None,
                    "popularity_score": 0,
                    "_priority": 0,
                },
                {
                    "id": 9787545144246,
                    "title": "补充标题",
                    "author": "",
                    "publisher": "辽海出版社",
                    "price": 70.0,
                    "stock": 5,
                    "category": "B842.5",
                    "description": "",
                    "publication_year": 2018,
                    "cover_url": None,
                    "popularity_score": 5,
                    "_priority": 1,
                },
            ]
        )

        self.assertEqual(merged["title"], "主数据标题")
        self.assertEqual(merged["author"], "主作者")
        self.assertEqual(merged["publisher"], "辽海出版社")
        self.assertEqual(merged["description"], "主简介")
        self.assertEqual(merged["stock"], 5)
        self.assertEqual(merged["publication_year"], 2018)

    def test_merge_keeps_valid_main_publication_year(self):
        merged = merge_book_records(
            [
                {"id": 1, "publication_year": 2024, "_priority": 0},
                {"id": 1, "publication_year": 2018, "_priority": 1},
            ]
        )

        self.assertEqual(merged["publication_year"], 2024)


class FilterParsingTests(unittest.TestCase):
    def test_parse_filter_paragraphs_extracts_unique_keywords(self):
        entries = parse_filter_paragraphs(
            [
                "需要排除的带关键词的图书",
                "公共馆",
                "学生 学校 校园",
                "成人目录",
                "注音 拼音 绘本",
                "学生 学校 校园",
            ]
        )

        self.assertIn(("学生", "公共馆"), entries)
        self.assertIn(("绘本", "成人目录"), entries)
        self.assertIn(("学生", "成人目录"), entries)
        self.assertEqual(len(entries), 9)


if __name__ == "__main__":
    unittest.main()
