import cv2
import numpy as np
from pathlib import Path

src = "assets/hiro-chan-patch-reference.png"
out = Path("output")
out.mkdir(exist_ok=True)

image = cv2.imread(src)
image = image[70:650, 1025:1460]
if image is None:
    raise SystemExit(f"Cannot read {src}")

# Keep low-saturation gray fabric, excluding much of the orange seams.
hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
h, s, v = cv2.split(hsv)

mask = (
    (s < 100) &
    (v > 65) &
    (v < 220)
).astype(np.uint8) * 255

# Join small gaps in fabric texture and remove tiny noise.
kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))

count, labels, stats, centroids = cv2.connectedComponentsWithStats(mask)

preview = image.copy()
found = 0

for i in range(1, count):
    x, y, w, h, area = stats[i]
    if area < 400:
        continue

    # Draw candidate fabric areas for visual inspection.
    found += 1
    cv2.rectangle(preview, (x, y), (x+w, y+h), (0, 255, 0), 2)

cv2.imwrite(str(out / "fabric-mask.png"), mask)
cv2.imwrite(str(out / "fabric-candidates.png"), preview)

print("Candidate areas:", found)
print("Saved output/fabric-mask.png")
print("Saved output/fabric-candidates.png")
print("These are candidates, not final patch boundaries.")
