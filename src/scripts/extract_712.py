
import re
import os
import json
import sys
from difflib import get_close_matches
from pdf2image import convert_from_path
import pytesseract

# ==============================
# PATH CONFIG
# ==============================

if len(sys.argv) < 2:
    print(json.dumps({"error": "No PDF path provided"}))
    sys.exit(1)

PDF_PATH = sys.argv[1]
POPPLER_PATH = r"C:\Users\athar\Downloads\Release-25.12.0-0\poppler-25.12.0\Library\bin"
JSON_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "data", "output.json")

pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

# ==============================
# LOAD MASTER JSON
# ==============================

if not os.path.exists(JSON_PATH):
    # Try alternate location if running from root
    JSON_PATH = os.path.join("data", "output.json")

with open(JSON_PATH, "r", encoding="utf-8") as f:
    json_data = json.load(f)

# ==============================
# CONSTANTS
# ==============================

DEVANAGARI_TO_ASCII = str.maketrans("०१२३४५६७८९", "0123456789")

# ==============================
# BASIC CLEANING
# ==============================

def clean(text: str) -> str:
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n+", "\n", text)
    return text.strip()

def pick(pattern: str, text: str):
    m = re.search(pattern, text, flags=re.IGNORECASE)
    return m.group(1).strip() if m else None

# ==============================
# OCR NORMALIZATION
# ==============================

def normalize_place_name(s: str):
    if not s:
        return None

    # Remove both complete brackets (528822) and incomplete brackets (528822
    s = re.sub(r"\(.*?\)", "", s)       # complete brackets
    s = re.sub(r"\(\d+", "", s)         # incomplete opening bracket with digits
    s = re.sub(r"\(\S+", "", s)         # any other incomplete bracket

    noise_words = ["हि", "ता", "ता.", "दि", "जि", "जि."]
    words = [w for w in s.strip().split() if w not in noise_words]

    return " ".join(words).strip()

# ==============================
# LOCATION EXTRACTION
# ==============================

def cut_at_next_label(val: str):
    if not val:
        return None

    stops = ["तालुका", "जिल्हा", "गट", "PU-ID",
             "नमुना", "अधिकार", "अभिलेख", "पत्रक"]

    for s in stops:
        if s in val:
            val = val.split(s)[0]

    return val.strip(" :-—")

def extract_location_fields(text: str):
    t = clean(text)
    sep = r"(?::\-|:-|:|—|-)"

    village_raw = pick(rf"गाव\s*{sep}\s*([^\n]+)", t)
    taluka_raw  = pick(rf"तालुका\s*{sep}\s*([^\n]+)", t)
    district_raw = pick(rf"जिल्हा\s*{sep}\s*([^\n]+)", t)

    return {
        "Village":  normalize_place_name(cut_at_next_label(village_raw)),
        "Taluka":   normalize_place_name(cut_at_next_label(taluka_raw)),
        "District": normalize_place_name(cut_at_next_label(district_raw)),
    }

def normalize_ocr_text(t: str):
    # Convert Devanagari digits to ASCII
    t = t.translate(DEVANAGARI_TO_ASCII)
    # Remove complete bracket content like (528822)
    t = re.sub(r"\(.*?\)", "", t)
    # Remove garbage symbols but keep Devanagari, digits, spaces, colon, dot, dash
    t = re.sub(r"[^\w\sऀ-ॿ:.\-]", " ", t)
    # Remove single Marathi chars that appear after numbers (e.g. "336 न")
    t = re.sub(r"([0-9])\s+[ऀ-ॿ]\b", r"\1", t)
    return t

# ==============================
# GAT NUMBER EXTRACTION
# ==============================

def extract_gat_number(text: str):
    t = normalize_ocr_text(clean(text))

    # Primary: गट क्रमांक followed by digits (with optional text in between)
    m = re.search(r"गट\s*क्रमांक[^0-9]{0,30}?([0-9]{1,5})", t)
    if m:
        return m.group(1)

    # Fallback 1: "गट क्रमांक व उपविभाग" style (common in 7/12)
    m = re.search(r"गट\s*क्रमांक\s*व\s*उपवि[^\n]{0,20}?([0-9]{1,5})", t)
    if m:
        return m.group(1)

    # Fallback 2: look for standalone pattern like ": 336" near the गट keyword area
    # Search in lines that contain "गट"
    for line in t.splitlines():
        if "गट" in line:
            nums = re.findall(r"\b([0-9]{1,5})\b", line)
            # Return the first reasonable gat number (exclude very small numbers like 1,2)
            for n in nums:
                if int(n) > 10:
                    return n

    return None

# ==============================
# FUZZY MATCHING
# ==============================

def match_district(extracted):
    if not extracted:
        return extracted
    options = [d["backend_value"] for d in json_data["district_menu"]]
    match = get_close_matches(extracted, options, n=1, cutoff=0.6)
    return match[0] if match else extracted

def match_taluka(extracted, district):
    if not extracted or district not in json_data["taluka_menu"]:
        return extracted
    options = [t["backend_value"] for t in json_data["taluka_menu"][district]]
    match = get_close_matches(extracted, options, n=1, cutoff=0.6)
    return match[0] if match else extracted

def match_village(extracted, taluka):
    if not extracted or taluka not in json_data["village_menu"]:
        return extracted
    options = [v["backend_value"] for v in json_data["village_menu"][taluka]]
    match = get_close_matches(extracted, options, n=1, cutoff=0.6)
    return match[0] if match else extracted

# ==============================
# OCR PROCESS
# ==============================

try:
    page = convert_from_path(
        PDF_PATH,
        dpi=350,
        first_page=1,
        last_page=1,
        poppler_path=POPPLER_PATH
    )[0]

    w, h = page.size

    band1 = page.crop((0, int(h * 0.08), w, int(h * 0.22)))
    band2 = page.crop((0, int(h * 0.22), w, int(h * 0.50)))

    text1 = pytesseract.image_to_string(band1, lang="mar")
    text2 = pytesseract.image_to_string(band2, lang="mar")

    # ==============================
    # EXTRACTION
    # ==============================

    loc = extract_location_fields(text1)

    # Try band1 first (gat number usually in header), then band2
    gat = extract_gat_number(text1) or extract_gat_number(text2)

    district_std = match_district(loc["District"])
    taluka_std   = match_taluka(loc["Taluka"], district_std)
    village_std  = match_village(loc["Village"], taluka_std)

    final_result = {
        "success": True,
        "GatNumber": gat,
        "Village":   village_std,
        "Taluka":    taluka_std,
        "District":  district_std
    }
    
    print(json.dumps(final_result))

except Exception as e:
    print(json.dumps({"success": False, "error": str(e)}))
