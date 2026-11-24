from pathlib import Path
import cv2
import json

REFERENCE = Path("assets/hiro-chan-patch-reference.png")
MODEL = Path("public/models/hiro-chan.glb")
OUTPUT = Path("output")

if not REFERENCE.exists():
    raise SystemExit(f"Missing reference image: {REFERENCE}")

if not MODEL.exists():
    raise SystemExit(f"Missing robot model: {MODEL}")

image = cv2.imread(str(REFERENCE))
if image is None:
    raise SystemExit("Could not read the reference image.")

OUTPUT.mkdir(exist_ok=True)

# Save a clean copy for the next extraction stage.
preview_path = OUTPUT / "patch-reference-preview.png"
cv2.imwrite(str(preview_path), image)

# Store the sensor identities from the reference's mapping table.
front = [
    "Head left top", "Head right top",
    "Head left bottom", "Head right bottom",
    "Chest left upper", "Chest right upper",
    "Chest left lower", "Chest right lower",
    "Abdomen left", "Abdomen right",
    "Left arm upper", "Right arm upper",
    "Left arm lower", "Right arm lower",
    "Left thigh upper", "Right thigh upper",
    "Left leg lower", "Right leg lower",
    "Left foot top", "Right foot top",
]

back = [
    "Head left top", "Head right top",
    "Head left bottom", "Head right bottom",
    "Upper back left", "Upper back right",
    "Mid back left", "Mid back right",
    "Lower back left", "Lower back right",
    "Left arm upper", "Right arm upper",
    "Left arm lower", "Right arm lower",
    "Left thigh upper", "Right thigh upper",
    "Left leg lower", "Right leg lower",
    "Left foot bottom", "Right foot bottom",
]

regions = []
for number, name in enumerate(front, start=1):
    regions.append({
        "id": number,
        "side": "front",
        "name": name,
        "status": "awaiting_surface_projection",
    })

for number, name in enumerate(back, start=21):
    regions.append({
        "id": number,
        "side": "back",
        "name": name,
        "status": "awaiting_surface_projection",
    })

data = {
    "version": 1,
    "model": str(MODEL),
    "reference": str(REFERENCE),
    "reference_image_size": {
        "width": int(image.shape[1]),
        "height": int(image.shape[0]),
    },
    "regions": regions,
    "note": (
        "This file records sensor identities only. "
        "3D patch boundaries have not yet been calculated."
    ),
}

json_path = OUTPUT / "touch-regions.json"
json_path.write_text(json.dumps(data, indent=2), encoding="utf-8")

print(f"Reference preview: {preview_path}")
print(f"Sensor identities: {len(regions)}")
print(f"Region metadata: {json_path}")
print("3D surface projection: not yet performed")
