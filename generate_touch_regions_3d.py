import json
from pathlib import Path

import numpy as np
import trimesh

MODEL = Path("public/models/hiro-chan.glb")
OUT = Path("output")
OUT.mkdir(exist_ok=True)

# Normalized (left, bottom, right, top) bounds.
# These are initial estimates, not measurements from fabric seams.
regions = {
    1: ("Head left top", "front", (-.39,.79,-.04,.91)),
    2: ("Head right top", "front", (.04,.79,.39,.91)),
    3: ("Head left bottom", "front", (-.38,.68,-.04,.79)),
    4: ("Head right bottom", "front", (.04,.68,.38,.79)),
    5: ("Chest left upper", "front", (-.35,.55,-.04,.67)),
    6: ("Chest right upper", "front", (.04,.55,.35,.67)),
    7: ("Chest left lower", "front", (-.33,.43,-.04,.55)),
    8: ("Chest right lower", "front", (.04,.43,.33,.55)),
    9: ("Abdomen left", "front", (-.31,.29,-.025,.43)),
    10: ("Abdomen right", "front", (.025,.29,.31,.43)),
    11: ("Left arm upper", "front", (-.68,.48,-.40,.62)),
    12: ("Right arm upper", "front", (.40,.48,.68,.62)),
    13: ("Left arm lower", "front", (-.75,.34,-.48,.46)),
    14: ("Right arm lower", "front", (.48,.34,.75,.46)),
    15: ("Left thigh upper", "front", (-.57,.20,-.27,.32)),
    16: ("Right thigh upper", "front", (.27,.20,.57,.32)),
    17: ("Left leg lower", "front", (-.62,.09,-.36,.21)),
    18: ("Right leg lower", "front", (.36,.09,.62,.21)),
    19: ("Left foot top", "front", (-.67,.015,-.39,.10)),
    20: ("Right foot top", "front", (.39,.015,.67,.10)),

    21: ("Head left top", "back", (-.39,.79,-.04,.91)),
    22: ("Head right top", "back", (.04,.79,.39,.91)),
    23: ("Head left bottom", "back", (-.38,.68,-.04,.79)),
    24: ("Head right bottom", "back", (.04,.68,.38,.79)),
    25: ("Upper back left", "back", (-.34,.55,-.04,.67)),
    26: ("Upper back right", "back", (.04,.55,.34,.67)),
    27: ("Mid back left", "back", (-.32,.43,-.04,.55)),
    28: ("Mid back right", "back", (.04,.43,.32,.55)),
    29: ("Lower back left", "back", (-.30,.29,-.025,.43)),
    30: ("Lower back right", "back", (.025,.29,.30,.43)),
    31: ("Left arm upper", "back", (-.68,.48,-.40,.62)),
    32: ("Right arm upper", "back", (.40,.48,.68,.62)),
    33: ("Left arm lower", "back", (-.75,.34,-.48,.46)),
    34: ("Right arm lower", "back", (.48,.34,.75,.46)),
    35: ("Left thigh upper", "back", (-.57,.20,-.27,.32)),
    36: ("Right thigh upper", "back", (.27,.20,.57,.32)),
    37: ("Left leg lower", "back", (-.62,.09,-.36,.21)),
    38: ("Right leg lower", "back", (.36,.09,.62,.21)),
    39: ("Left foot bottom", "back", (-.67,.015,-.39,.10)),
    40: ("Right foot bottom", "back", (.39,.015,.67,.10)),
}

scene = trimesh.load(MODEL, force="scene")
mesh = trimesh.util.concatenate([
    g for g in scene.geometry.values()
    if isinstance(g, trimesh.Trimesh)
])
(xmin, ymin, zmin), (xmax, ymax, zmax) = mesh.bounds

# Map normalized horizontal/vertical coordinates to mesh bounds.
# Sample each rectangle edge; cast each sample onto the chosen side.
def project_edge(bounds, side, samples_per_edge=8):
    left, bottom, right, top = bounds
    corners = [
        (left, bottom), (right, bottom),
        (right, top), (left, top), (left, bottom)
    ]
    xy = []
    for a, b in zip(corners[:-1], corners[1:]):
        for t in np.linspace(0, 1, samples_per_edge, endpoint=False):
            xy.append((a[0] + t*(b[0]-a[0]),
                       a[1] + t*(b[1]-a[1])))

    xy = np.asarray(xy)
    x = xmin + (xy[:, 0] + 1) * 0.5 * (xmax - xmin)
    y = ymin + xy[:, 1] * (ymax - ymin)
    z_start = zmax + 0.15 if side == "front" else zmin - 0.15
    dz = -1.0 if side == "front" else 1.0

    origins = np.column_stack([x, y, np.full(len(x), z_start)])
    directions = np.tile([0.0, 0.0, dz], (len(x), 1))

    locations, ray_ids, face_ids = mesh.ray.intersects_location(
        origins, directions, multiple_hits=False
    )
    found = {}
    for point, ray_id, face_id in zip(locations, ray_ids, face_ids):
        found[int(ray_id)] = {
            "position": point.tolist(),
            "normal": mesh.face_normals[face_id].tolist()
        }
    return [found[i] for i in sorted(found)]

output_regions = []
for region_id, (name, side, bounds) in regions.items():
    points = project_edge(bounds, side)
    if len(points) < 3:
        print(f"WARNING: region {region_id} has only {len(points)} projected points")
    output_regions.append({"name": f"{region_id}. {name}", "points": points})
    print(f"{region_id:02d}: {name}: {len(points)} boundary points")

result = {"version": 2, "regions": output_regions}
path = OUT / "hiro-touch-regions.json"
path.write_text(json.dumps(result, indent=2))
print(f"\nCreated {path} with {len(output_regions)} regions.")
print("IMPORTANT: These are rough initial estimates; inspect before use.")
