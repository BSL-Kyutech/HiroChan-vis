import json
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from pathlib import Path

data = json.loads(
    Path("output/surface-projection-test.json").read_text()
)

fig, ax = plt.subplots(figsize=(8, 8))

for side, marker in [("front", "."), ("back", "x")]:
    points = np.array([
        item["position"] for item in data[side]
    ])

    if len(points):
        ax.scatter(
            points[:, 0],
            points[:, 1],
            s=5,
            marker=marker,
            label=side
        )

ax.set_xlabel("X")
ax.set_ylabel("Y (height)")
ax.set_title("Hiro-chan: projected surface hit points")
ax.set_aspect("equal")
ax.legend()
ax.grid(True, alpha=0.25)

path = Path("output/surface-hit-preview.png")
fig.savefig(path, dpi=160, bbox_inches="tight")
plt.close(fig)

print("Saved:", path)
