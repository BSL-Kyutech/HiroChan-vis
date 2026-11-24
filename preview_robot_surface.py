import trimesh
import numpy as np
from pathlib import Path

model_path = "public/models/hiro-chan.glb"
out = Path("output")
out.mkdir(exist_ok=True)

scene = trimesh.load(model_path, force="scene")
mesh = trimesh.util.concatenate(
    [g for g in scene.geometry.values() if isinstance(g, trimesh.Trimesh)]
)

print("Vertices:", len(mesh.vertices))
print("Faces:", len(mesh.faces))
print("Bounds:")
print(mesh.bounds)

# Save a copy for inspection; this does not modify the original GLB.
mesh.export(out / "hiro-chan-surface-preview.ply")
print("Saved: output/hiro-chan-surface-preview.ply")
print("Next: render front/back views and align the patch outlines.")
