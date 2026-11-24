import json
import numpy as np
import trimesh
from pathlib import Path

model_path = "public/models/hiro-chan.glb"
out = Path("output")
out.mkdir(exist_ok=True)

scene = trimesh.load(model_path, force="scene")
mesh = trimesh.util.concatenate([
    g for g in scene.geometry.values()
    if isinstance(g, trimesh.Trimesh)
])

bounds = mesh.bounds
(xmin, ymin, zmin), (xmax, ymax, zmax) = bounds

# Sample a grid across the model's front/back projection.
xs = np.linspace(xmin, xmax, 55)
ys = np.linspace(ymin, ymax, 65)
xx, yy = np.meshgrid(xs, ys)
xy = np.column_stack((xx.ravel(), yy.ravel()))

results = {}

for side, origin_z, direction_z in [
    ("front", zmax + 0.2, -1.0),
    ("back", zmin - 0.2, 1.0),
]:
    origins = np.column_stack((
        xy[:, 0],
        xy[:, 1],
        np.full(len(xy), origin_z)
    ))
    directions = np.tile([0.0, 0.0, direction_z], (len(xy), 1))

    locations, ray_ids, face_ids = mesh.ray.intersects_location(
        ray_origins=origins,
        ray_directions=directions,
        multiple_hits=False
    )

    normals = mesh.face_normals[face_ids]

    results[side] = [
        {
            "position": np.round(point, 6).tolist(),
            "normal": np.round(normal, 6).tolist(),
        }
        for point, normal in zip(locations, normals)
    ]

    print(f"{side}: {len(locations)} surface hits")

output_path = out / "surface-projection-test.json"
output_path.write_text(json.dumps(results, indent=2))

print("Saved:", output_path)
print("This is a projection test, not the final 40-region map.")
