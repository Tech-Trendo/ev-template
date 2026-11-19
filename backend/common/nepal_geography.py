"""Nepal administrative geography reference: 7 Provinces and 77 Districts.

Used for validation and spelling normalisation across customer records,
historical imports, and location pickers. Case-insensitive and whitespace-tolerant.
"""

from __future__ import annotations
from typing import Optional, Tuple

PROVINCES = [
    "Koshi",
    "Madhesh",
    "Bagmati",
    "Gandaki",
    "Lumbini",
    "Karnali",
    "Sudurpashchim",
]

# District to canonical Province mapping (77 districts)
DISTRICT_PROVINCE_MAP = {
    # Koshi Province (14)
    "Bhojpur": "Koshi",
    "Dhankuta": "Koshi",
    "Ilam": "Koshi",
    "Jhapa": "Koshi",
    "Khotang": "Koshi",
    "Morang": "Koshi",
    "Okhaldhunga": "Koshi",
    "Panchthar": "Koshi",
    "Sankhuwasabha": "Koshi",
    "Solukhumbu": "Koshi",
    "Sunsari": "Koshi",
    "Taplejung": "Koshi",
    "Terhathum": "Koshi",
    "Udayapur": "Koshi",

    # Madhesh Province (8)
    "Bara": "Madhesh",
    "Dhanusha": "Madhesh",
    "Mahottari": "Madhesh",
    "Parsa": "Madhesh",
    "Rautahat": "Madhesh",
    "Saptari": "Madhesh",
    "Sarlahi": "Madhesh",
    "Siraha": "Madhesh",

    # Bagmati Province (13)
    "Bhaktapur": "Bagmati",
    "Chitwan": "Bagmati",
    "Dhading": "Bagmati",
    "Dolakha": "Bagmati",
    "Kathmandu": "Bagmati",
    "Kavrepalanchok": "Bagmati",
    "Lalitpur": "Bagmati",
    "Makwanpur": "Bagmati",
    "Nuwakot": "Bagmati",
    "Ramechhap": "Bagmati",
    "Rasuwa": "Bagmati",
    "Sindhuli": "Bagmati",
    "Sindhupalchok": "Bagmati",

    # Gandaki Province (11)
    "Baglung": "Gandaki",
    "Gorkha": "Gandaki",
    "Kaski": "Gandaki",
    "Lamjung": "Gandaki",
    "Manang": "Gandaki",
    "Mustang": "Gandaki",
    "Myagdi": "Gandaki",
    "Nawalpur": "Gandaki",
    "Parbat": "Gandaki",
    "Syangja": "Gandaki",
    "Tanahun": "Gandaki",

    # Lumbini Province (12)
    "Arghakhanchi": "Lumbini",
    "Banke": "Lumbini",
    "Bardiya": "Lumbini",
    "Dang": "Lumbini",
    "Gulmi": "Lumbini",
    "Kapilvastu": "Lumbini",
    "Parasi": "Lumbini",
    "Palpa": "Lumbini",
    "Pyuthan": "Lumbini",
    "Rolpa": "Lumbini",
    "Rukum East": "Lumbini",
    "Rupandehi": "Lumbini",

    # Karnali Province (10)
    "Dailekh": "Karnali",
    "Dolpa": "Karnali",
    "Humla": "Karnali",
    "Jajarkot": "Karnali",
    "Jumla": "Karnali",
    "Kalikot": "Karnali",
    "Mugu": "Karnali",
    "Rukum West": "Karnali",
    "Salyan": "Karnali",
    "Surkhet": "Karnali",

    # Sudurpashchim Province (9)
    "Achham": "Sudurpashchim",
    "Baitadi": "Sudurpashchim",
    "Bajhang": "Sudurpashchim",
    "Bajura": "Sudurpashchim",
    "Dadeldhura": "Sudurpashchim",
    "Darchula": "Sudurpashchim",
    "Doti": "Sudurpashchim",
    "Kailali": "Sudurpashchim",
    "Kanchanpur": "Sudurpashchim",
}

# Common alternate spellings and abbreviations
DISTRICT_ALIASES = {
    "kavre": "Kavrepalanchok",
    "kabhre": "Kavrepalanchok",
    "kavrepalanchowk": "Kavrepalanchok",
    "kabhrepalanchok": "Kavrepalanchok",
    "chitawan": "Chitwan",
    "makawanpur": "Makwanpur",
    "tanahu": "Tanahun",
    "dhanusa": "Dhanusha",
    "nawalparasi east": "Nawalpur",
    "nawalparasi (east)": "Nawalpur",
    "nawalparasi-east": "Nawalpur",
    "nawalpur": "Nawalpur",
    "nawalparasi west": "Parasi",
    "nawalparasi (west)": "Parasi",
    "nawalparasi-west": "Parasi",
    "parasi": "Parasi",
    "eastern rukum": "Rukum East",
    "rukum (east)": "Rukum East",
    "rukum east": "Rukum East",
    "western rukum": "Rukum West",
    "rukum (west)": "Rukum West",
    "rukum west": "Rukum West",
    "tehrathum": "Terhathum",
    "terhathum": "Terhathum",
    "panchthar": "Panchthar",
    "sindhupalchowk": "Sindhupalchok",
    "kapilbastu": "Kapilvastu",
}

PROVINCE_ALIASES = {
    "province 1": "Koshi",
    "province 2": "Madhesh",
    "province 3": "Bagmati",
    "province 4": "Gandaki",
    "province 5": "Lumbini",
    "province 6": "Karnali",
    "province 7": "Sudurpashchim",
    "koshi pradesh": "Koshi",
    "madhesh pradesh": "Madhesh",
    "bagmati pradesh": "Bagmati",
    "gandaki pradesh": "Gandaki",
    "lumbini pradesh": "Lumbini",
    "karnali pradesh": "Karnali",
    "sudurpashchim pradesh": "Sudurpashchim",
    "sudurpaschim": "Sudurpashchim",
    "sudur paschim": "Sudurpashchim",
}


def normalize_province(raw: Optional[str]) -> Optional[str]:
    """Normalize province name or number; returns canonical name or None."""
    if not raw:
        return None
    cleaned = " ".join(raw.strip().split())
    lower = cleaned.lower()
    if lower in PROVINCE_ALIASES:
        return PROVINCE_ALIASES[lower]
    for p in PROVINCES:
        if p.lower() == lower:
            return p
    return None


def normalize_district_and_province(
    district_raw: Optional[str],
    province_raw: Optional[str] = None,
) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    """Validate and normalize district and province.

    Returns:
        (canonical_district, canonical_province, error_message)
        If valid: error_message is None.
        If unknown district: returns (None, None, error_message).
    """
    if not district_raw or not district_raw.strip():
        # District not provided
        canonical_prov = normalize_province(province_raw)
        return (None, canonical_prov, None)

    d_clean = " ".join(district_raw.strip().split())
    d_lower = d_clean.lower()

    canonical_district = None
    if d_lower in DISTRICT_ALIASES:
        canonical_district = DISTRICT_ALIASES[d_lower]
    else:
        for d in DISTRICT_PROVINCE_MAP:
            if d.lower() == d_lower:
                canonical_district = d
                break

    if not canonical_district:
        return (
            None,
            None,
            f"Unknown district '{district_raw.strip()}'. Must be one of Nepal's 77 recognized districts.",
        )

    expected_province = DISTRICT_PROVINCE_MAP[canonical_district]

    if province_raw and province_raw.strip():
        given_province = normalize_province(province_raw)
        if given_province and given_province.lower() != expected_province.lower():
            # Mismatched province given for district
            return (
                canonical_district,
                expected_province,
                f"District '{canonical_district}' belongs to {expected_province} Province, not {province_raw.strip()}.",
            )

    return (canonical_district, expected_province, None)
