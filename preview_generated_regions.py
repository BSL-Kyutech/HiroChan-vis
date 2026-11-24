import json
from pathlib import Path
import numpy as np
import trimesh
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

out = Path("output")
data = json.loads((out / "hiro-touch-regions.json").read_text())
scene = trimesh.load("public/models/hiro-chan.glb", force="scene")
mesh = trimesh.util.concatenate([
    g for g in scene.geometry.values()
    if isinstance(g, trimesh.Trimesh)
])

fig = plt.figure(figsize=(14, 7))

for panel, side, elev, azim in [
    (1, "front", 0, 90),
    (2, "back", 0, -90),
]:
    ax = fig.add_subplot(1, 2, panel, projection="3d")
    ax.plot_trisurf(
        mesh.vertices[:, 0],
        mesh.vertices[:, 2],
        mesh.vertices[:, 1],
        triangles=mesh.faces,
        color="lightgray",
        linewidth=0,
        alpha=0.18,
    )

    for region in data["regions"]:
        region_side = "front" if int(region["name"].split(".")[0]) <= 20 else "back"
        if region_side != side:
            continue
        pts = np.array([p["position"] for p in region["points"]])
        ax.plot(pts[:, 0], pts[:, 2], pts[:, 1], linewidth=1.5)
        center = pts.mean(axis=0)
        ax.text(center[0], center[2], center[1],
                region["name"].split(".")[0], fontsize=8)

    ax.view_init(elev=elev, azim=azim)
    ax.set_title(f"{side.title()} patch boundaries")
    ax.set_axis_off()
    ax.set_box_aspect((1.62, 1.14, 1.95))

fig.tight_layout()
path = out / "generated-regions-preview.png"
fig.savefig(path, dpi=160)
plt.close(fig)
print("Saved:", path)
