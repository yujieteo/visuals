#!/usr/bin/env python3
"""Extract the FNDDS rows that outlets.csv references into fndds.csv.

FoodData Central publishes the Survey Foods (FNDDS) release as a zip of CSVs
(https://fdc.nal.usda.gov/download-datasets/). This keeps only the foods and
portions named in outlets.csv, so the build never needs the 3 MB download:

    curl -LO https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_survey_food_csv_2024-10-31.zip
    python extract_fndds.py FoodData_Central_survey_food_csv_2024-10-31.zip
"""
import csv
import io
import sys
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
# FNDDS food_nutrient.csv keys nutrients by their legacy number.
NUTRIENTS = {"208": "energy_kcal_per_100g", "203": "protein_g_per_100g",
             "204": "fat_g_per_100g", "205": "carbohydrate_g_per_100g"}
FIELDS = ["fdc_id", "description", "portion_description", "portion_g", *NUTRIENTS.values()]


def read(archive, name):
    member = next(m for m in archive.namelist() if m.endswith("/" + name))
    return csv.DictReader(io.TextIOWrapper(archive.open(member), encoding="utf-8"))


def main(zip_path):
    with open(HERE / "outlets.csv", newline="", encoding="utf-8") as handle:
        wanted = sorted({(row["nutrition_ref"], row["portion"]) for row in csv.DictReader(handle)
                         if row["nutrition_source"] == "fndds2024"})
    ids = {fdc_id for fdc_id, _ in wanted}
    with zipfile.ZipFile(zip_path) as archive:
        descriptions = {r["fdc_id"]: r["description"] for r in read(archive, "food.csv") if r["fdc_id"] in ids}
        values = {}
        for r in read(archive, "food_nutrient.csv"):
            if r["fdc_id"] in ids and r["nutrient_id"] in NUTRIENTS:
                values.setdefault(r["fdc_id"], {})[NUTRIENTS[r["nutrient_id"]]] = r["amount"]
        portions = {(r["fdc_id"], r["portion_description"]): r["gram_weight"]
                    for r in read(archive, "food_portion.csv") if r["fdc_id"] in ids}
    rows = []
    for fdc_id, portion in wanted:
        if (fdc_id, portion) not in portions:
            raise SystemExit(f"FNDDS has no portion {portion!r} for {fdc_id}")
        rows.append({"fdc_id": fdc_id, "description": descriptions[fdc_id], "portion_description": portion,
                     "portion_g": portions[(fdc_id, portion)], **values[fdc_id]})
    with open(HERE / "fndds.csv", "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, FIELDS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    print(f"wrote {len(rows)} rows to fndds.csv")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    main(sys.argv[1])
