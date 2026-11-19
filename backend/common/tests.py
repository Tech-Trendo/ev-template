from django.test import SimpleTestCase
from common.phone import normalize_nepal_phone


class PhoneNormalizationTests(SimpleTestCase):
    def test_standard_10_digit(self):
        self.assertEqual(normalize_nepal_phone("9841234567"), "9841234567")
        self.assertEqual(normalize_nepal_phone("9741234567"), "9741234567")

    def test_with_country_code(self):
        self.assertEqual(normalize_nepal_phone("+977-9841234567"), "9841234567")
        self.assertEqual(normalize_nepal_phone("+977 984 123 4567"), "9841234567")
        self.assertEqual(normalize_nepal_phone("00977 9841234567"), "9841234567")
        self.assertEqual(normalize_nepal_phone("9779841234567"), "9841234567")

    def test_with_formatting_and_spaces(self):
        self.assertEqual(normalize_nepal_phone(" 9841-234-567 "), "9841234567")
        self.assertEqual(normalize_nepal_phone("(9841) 234567"), "9841234567")

    def test_leading_zero(self):
        self.assertEqual(normalize_nepal_phone("09841234567"), "9841234567")

    def test_landline(self):
        self.assertEqual(normalize_nepal_phone("01-4234567"), "014234567")
        self.assertEqual(normalize_nepal_phone("+977-1-4234567"), "014234567")
        self.assertEqual(normalize_nepal_phone("97714234567"), "014234567")

    def test_empty_or_none(self):
        self.assertEqual(normalize_nepal_phone(""), "")
        self.assertEqual(normalize_nepal_phone(None), "")
