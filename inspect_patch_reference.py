import cv2
import os

path = "assets/hiro-chan-patch-reference.png"
image = cv2.imread(path)

if image is None:
    raise SystemExit(f"Could not read: {path}")

gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
edges = cv2.Canny(gray, 60, 150)

os.makedirs("output", exist_ok=True)
cv2.imwrite("output/reference-edges.png", edges)

print("Reference size:", image.shape[1], "x", image.shape[0])
print("Edge image saved to: output/reference-edges.png")
print("Next: inspect the edge image before choosing the patch extraction method.")
