import trimesh
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from pathlib import Path

out = Path("output")
mesh = trimesh.load(out / "hiro-chan-surface-preview.ply", force="mesh")

for name, azimuth in [("front", 90), ("back", -90)]:
    fig = plt.figure(figsize=(6, 8))
    ax = fig.add_subplot(111, projection="3d")

    ax.plot_trisurf(
        mesh.vertices[:, 0],
        mesh.vertices[:, 2],
        mesh.vertices[:, 1],
        triangles=mesh.faces,
        color="lightgray",
        linewidth=0,
        antialiased=False
    )

    ax.view_init(elev=0, azim=azimuth)
    ax.set_axis_off()
    ax.set_box_aspect((1.62, 1.14, 1.95))
    fig.tight_layout()
    path = out / f"robot-{name}-preview.png"
    fig.savefig(path, dpi=140)
    plt.close(fig)
    print("Saved:", path)
