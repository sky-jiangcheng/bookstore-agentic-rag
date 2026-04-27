import unittest

from scripts.huqifeng_prepare import (
    merge_book_records,
    normalize_barcode,
    normalize_book_row,
    parse_filter_paragraphs,
    pick_category,
)


class NormalizeBarcodeTests(unittest.TestCase):
    def test_normalize_barcode_strips_decimal_suffix(self):
        self.assertEqual(normalize_barcode("9787545144246.0"), 9787545144246)

    def test_normalize_barcode_rejects_non_digits(self):
        self.assertIsNone(normalize_barcode("ABC-123"))


class CategoryTests(unittest.TestCase):
    def test_pick_category_prefers_subject_keyword(self):
        self.assertEqual(
            pick_category("思维心理学\\通俗读物", "B842.5"),
            "思维心理学",
        )

    def test_pick_category_falls_back_to_classification(self):
        self.assertEqual(pick_category("", "D0"), "D0")


class MergeBookRecordsTests(unittest.TestCase):
    def test_normalize_book_row_truncates_description_for_storage(self):
        row = normalize_book_row(
            {
                "条码": "9787545144246",
                "书名": "主数据标题",
                "内容简介": "甲" * 260,
                "主题词": "思维心理学",
            },
            priority=0,
        )

        self.assertEqual(row["id"], "9787545144246")
        self.assertEqual(len(row["description"]), 200)
        self.assertTrue(row["vector_text"].endswith("甲" * 260))

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
                    "vector_text": "主向量文本",
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
                    "vector_text": "",
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
        self.assertEqual(merged["vector_text"], "主向量文本")
        self.assertEqual(merged["stock"], 5)


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

        self.assertEqual(entries["学生"], "公共馆")
        self.assertEqual(entries["绘本"], "成人目录")
        self.assertEqual(len(entries), 6)


if __name__ == "__main__":
    unittest.main()
