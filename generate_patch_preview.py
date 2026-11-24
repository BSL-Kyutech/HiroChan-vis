import json
from pathlib import Path

out = Path("output")
data = json.loads((out / "touch-regions.json").read_text())

# Confirm all region identities before assigning any geometry.
regions = data["regions"]
assert len(regions) == 40
assert [r["id"] for r in regions] == list(range(1, 41))

print("Ready to map", len(regions), "regions.")
print("Front regions:", sum(r["side"] == "front" for r in regions))
print("Back regions:", sum(r["side"] == "back" for r in regions))
print()
print("No 3D coordinates were changed.")
print("Next: assign projected surface points using the aligned front/back views.")
