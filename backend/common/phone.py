import re


def normalize_nepal_phone(raw_phone: str | None) -> str:
    """Normalize Nepal phone numbers to a canonical digit string.

    Examples:
        - '+977-9841234567' -> '9841234567'
        - '+977 984 123 4567' -> '9841234567'
        - '00977 9841234567' -> '9841234567'
        - '9779841234567' -> '9841234567'
        - '09841234567' -> '9841234567'
        - '9841-234-567' -> '9841234567'
        - '01-4234567' -> '014234567'
        - '+977 1 4234567' -> '014234567'
    """
    if not raw_phone:
        return ""

    phone = str(raw_phone).strip()
    if not phone:
        return ""

    has_plus = phone.startswith("+")
    digits = re.sub(r"\D", "", phone)

    if not digits:
        return ""

    # Handle international prefixes (+977 or 00977 or 977)
    if phone.startswith("00977"):
        digits = digits[5:]
    elif has_plus and digits.startswith("977"):
        digits = digits[3:]
    elif digits.startswith("977") and len(digits) in (11, 12, 13):
        rest = digits[3:]
        if len(rest) == 10 and (rest.startswith("98") or rest.startswith("97") or rest.startswith("96")):
            digits = rest
        elif len(rest) in (7, 8) and rest.startswith("1"):
            digits = "0" + rest if not rest.startswith("0") else rest
        elif len(rest) in (8, 9) and rest.startswith("01"):
            digits = rest

    # If mobile has leading 0 (e.g. 09841234567 -> 11 digits)
    if len(digits) == 11 and (digits.startswith("098") or digits.startswith("097") or digits.startswith("096")):
        digits = digits[1:]

    # Landline missing leading zero (e.g. 14234567 -> 014234567, or 7-8 digits starting with 1)
    if len(digits) in (7, 8) and digits.startswith("1"):
        digits = "0" + digits

    return digits
