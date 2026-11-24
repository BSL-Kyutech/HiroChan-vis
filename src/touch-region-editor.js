import * as THREE from "three";

export class TouchRegionEditor {
  constructor({ scene, camera, renderer, controls, robot }) {
    Object.assign(this, { scene, camera, renderer, controls, robot });

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.regions = [];
    this.pendingPoints = [];
    this.selected = -1;
    this.drawing = false;

    this.overlay = new THREE.Group();
    this.overlay.name = "TouchRegionOverlays";
    scene.add(this.overlay);

    this._buildPanel();
    this._onPointerDown = this._onPointerDown.bind(this);
    renderer.domElement.addEventListener("pointerdown", this._onPointerDown);
  }

  _buildPanel() {
    const panel = document.createElement("div");
    panel.style.cssText = `
      position:fixed;right:12px;top:12px;z-index:9999;width:290px;
      max-height:85vh;overflow:auto;padding:12px;background:#171a21;
      color:white;border-radius:8px;font:13px system-ui;
      box-shadow:0 4px 18px #0008;
    `;

    panel.innerHTML = `
      <b>Hiro-chan Surface Region Editor</b>
      <p style="color:#bbb">Click the robot surface to trace a patch boundary.</p>
      <input id="tre-name" placeholder="Region name"
        style="box-sizing:border-box;width:100%;margin:5px 0;padding:7px">
      <button id="tre-draw">Start polygon</button>
      <button id="tre-undo">Undo point</button>
      <button id="tre-close">Close polygon</button>
      <button id="tre-cancel">Cancel</button>
      <p id="tre-count">Boundary points: 0</p>
      <button id="tre-save">Save region</button>
      <button id="tre-rename">Rename selected</button>
      <select id="tre-list" size="6"
        style="width:100%;margin-top:8px"></select>
      <button id="tre-delete">Delete selected</button>
      <button id="tre-export">Export JSON</button>
      <button id="tre-import">Import JSON</button>
      <input id="tre-file" type="file" accept=".json" style="display:none">
      <button id="tre-hide">Hide editor</button>
      <p id="tre-status">Start a polygon to begin.</p>
    `;

    document.body.appendChild(panel);
    this.panel = panel;

    const $ = id => panel.querySelector(`#tre-${id}`);

    this.nameInput = $("name");
    this.list = $("list");
    this.status = $("status");
    this.countLabel = $("count");

    $("draw").onclick = () => this.startDrawing();
    $("undo").onclick = () => this.undoPoint();
    $("close").onclick = () => this.closePolygon();
    $("cancel").onclick = () => this.cancelDrawing();
    $("save").onclick = () => this.saveRegion();
    $("delete").onclick = () => this.deleteSelected();
    $("export").onclick = () => this.exportJSON();
    $("import").onclick = () => $("file").click();
    $("file").onchange = event => this.importJSON(event);
    this.list.onchange = () => {
      this.selected = Number(this.list.value);
      this.redraw();
    };

    $("hide").onclick = () => {
      panel.style.display = "none";
      const show = document.createElement("button");
      show.textContent = "Show region editor";
      show.style.cssText =
        "position:fixed;right:12px;top:12px;z-index:10000;padding:8px";
      show.onclick = () => {
        panel.style.display = "block";
        show.remove();
      };
      document.body.appendChild(show);
    };
  }

  startDrawing() {
  this.drawing = true;
  this.pendingPoints = [];
  this.controls.enabled = true;

  this.status.textContent =
    "Left-click the robot to add points. Right-drag or middle-drag to rotate/pan; scroll to zoom. Close polygon when finished.";

  this._updateCount();
  this.redraw();
}

_onPointerDown(event) {
  if (!this.drawing || event.button !== 0) return;
  if (this.panel.contains(event.target)) return;

  const rect = this.renderer.domElement.getBoundingClientRect();

  this.pointer.x =
    ((event.clientX - rect.left) / rect.width) * 2 - 1;
  this.pointer.y =
    -((event.clientY - rect.top) / rect.height) * 2 + 1;

  // Update world matrices after rotating or moving the model.
  this.scene.updateMatrixWorld(true);
  this.camera.updateMatrixWorld(true);

  this.raycaster.setFromCamera(this.pointer, this.camera);
  this.raycaster.near = 0;
  this.raycaster.far = Infinity;

  const hits = this.raycaster.intersectObject(this.robot, true);
  const hit = hits.find(
    item => item.object.isMesh && item.face && item.object.visible
  );

  if (!hit) {
    this.status.textContent =
      `No surface hit. Meshes checked: ${this.robot.children.length}. Try clicking the visible robot body.`;
    return;
  }

  const normal = hit.face.normal.clone()
    .transformDirection(hit.object.matrixWorld)
    .normalize();

  this.pendingPoints.push({
    position: hit.point.clone().addScaledVector(normal, 0.001),
    normal
  });

  this._updateCount();
  this.redraw();
}

  _updateCount() {
    this.countLabel.textContent = `Boundary points: ${this.pendingPoints.length}`;
  }

  undoPoint() {
    if (!this.pendingPoints.length) return;
    this.pendingPoints.pop();
    this._updateCount();
    this.redraw();
  }

  cancelDrawing() {
    this.drawing = false;
    this.pendingPoints = [];
    this.controls.enabled = true;
    this._updateCount();
    this.redraw();
    this.status.textContent = "Drawing cancelled.";
  }

  closePolygon() {
    if (this.pendingPoints.length < 3) {
      this.status.textContent = "A polygon needs at least 3 points.";
      return;
    }

    this.drawing = false;
    this.controls.enabled = true;
    this.status.textContent =
      "Boundary closed. Enter a name, then click Save region.";
    this.redraw();
  }

  _makeLine(points, color, closed = false) {
    if (points.length < 2) return;

    const positions = points.map(p => p.position || p);
    const vertices = positions.map(p => p.clone());
    if (closed && vertices.length > 2) vertices.push(vertices[0].clone());

    const geometry = new THREE.BufferGeometry().setFromPoints(vertices);
    const material = new THREE.LineBasicMaterial({
      color,
      depthTest: false
    });
    const line = new THREE.Line(geometry, material);
    line.renderOrder = 1000;
    this.overlay.add(line);
  }

  _makeSurfaceFill(points, color) {
    if (points.length < 3) return;

    // Triangulate the polygon in a local 2D plane derived from its average normal.
    const positions = points.map(p => p.position || p);
    const centre = new THREE.Vector3();
    positions.forEach(p => centre.add(p));
    centre.divideScalar(positions.length);

    const normal = new THREE.Vector3();
    points.forEach(p => {
      if (p.normal) normal.add(p.normal);
    });
    if (normal.lengthSq() < 1e-8) normal.set(0, 0, 1);
    normal.normalize();

    let tangent = new THREE.Vector3(1, 0, 0);
    tangent.addScaledVector(normal, -tangent.dot(normal));
    if (tangent.lengthSq() < 1e-8) {
      tangent.set(0, 1, 0);
      tangent.addScaledVector(normal, -tangent.dot(normal));
    }
    tangent.normalize();

    const bitangent = new THREE.Vector3()
      .crossVectors(normal, tangent).normalize();

    const shape = new THREE.Shape();
    positions.forEach((p, i) => {
      const d = p.clone().sub(centre);
      const x = d.dot(tangent);
      const y = d.dot(bitangent);
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    });
    shape.closePath();

    const flat = new THREE.ShapeGeometry(shape);
    const attr = flat.attributes.position;
    const worldVertices = [];

    for (let i = 0; i < attr.count; i++) {
      const x = attr.getX(i);
      const y = attr.getY(i);
      const estimate = centre.clone()
        .addScaledVector(tangent, x)
        .addScaledVector(bitangent, y);

      // Project each fill vertex back onto the nearby robot surface.
      const rayOrigin = estimate.clone().addScaledVector(normal, 0.08);
      this.raycaster.set(rayOrigin, normal.clone().negate());
      this.raycaster.near = 0;
      this.raycaster.far = 0.2;
      const hits = this.raycaster.intersectObject(this.robot, true);

      worldVertices.push(
        hits.length
          ? hits[0].point.clone().addScaledVector(normal, 0.002)
          : estimate.clone().addScaledVector(normal, 0.002)
      );
    }

    const geometry = new THREE.BufferGeometry();
    const localVertices = worldVertices.map(p => this.overlay.worldToLocal(p.clone()));
    const flatPositions = [];
    localVertices.forEach(p => flatPositions.push(p.x, p.y, p.z));

    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(flatPositions, 3)
    );
    geometry.setIndex(Array.from(flat.index.array));
    geometry.computeVertexNormals();

    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
      depthTest: false
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 999;
    this.overlay.add(mesh);
  }

  saveRegion() {
    if (this.drawing || this.pendingPoints.length < 3) {
      this.status.textContent = "Close a polygon with at least 3 points first.";
      return;
    }

    const name = this.nameInput.value.trim();
    if (!name) {
      this.status.textContent = "Enter a region name first.";
      return;
    }

    this.regions.push({
      name,
      points: this.pendingPoints.map(p => ({
        position: p.position.toArray(),
        normal: p.normal.toArray()
      }))
    });

    this.selected = this.regions.length - 1;
    this.pendingPoints = [];
    this._updateList();
    this._updateCount();
    this.redraw();
    this.status.textContent = `Saved "${name}".`;
  }

  deleteSelected() {
    if (!this.regions[this.selected]) return;
    this.regions.splice(this.selected, 1);
    this.selected = -1;
    this._updateList();
    this.redraw();
    this.status.textContent = "Region deleted.";
  }

  _updateList() {
    this.list.innerHTML = "";
    this.regions.forEach((region, index) => {
      const option = document.createElement("option");
      option.value = index;
      option.textContent = region.name;
      this.list.appendChild(option);
    });
    if (this.selected >= 0) this.list.value = String(this.selected);
  }

  redraw() {
    this.overlay.clear();

    this.regions.forEach((region, index) => {
      const points = region.points.map(p => ({
        position: new THREE.Vector3(...p.position),
        normal: new THREE.Vector3(...p.normal)
      }));
      const color = index === this.selected ? 0x00ff88 : 0xffb52e;
      this._makeLine(points, color, true);
      // this._makeSurfaceFill(points, color);
    });

    if (this.pendingPoints.length) {
      this._makeLine(this.pendingPoints, 0x36b8ff, this.pendingPoints.length >= 3);
      this.pendingPoints.forEach(point => {
        const marker = new THREE.Mesh(
          new THREE.SphereGeometry(0.004, 8, 6),
          new THREE.MeshBasicMaterial({ color: 0x36b8ff, depthTest: false })
        );
        marker.position.copy(point.position);
        marker.renderOrder = 1001;
        this.overlay.add(marker);
      });
    }
  }

  exportJSON() {
    const blob = new Blob(
      [JSON.stringify({ version: 2, regions: this.regions }, null, 2)],
      { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "hiro-touch-regions.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  importJSON(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!Array.isArray(data.regions)) throw new Error("Invalid region file.");
        this.regions = data.regions.filter(r =>
          typeof r.name === "string" && Array.isArray(r.points) && r.points.length >= 3
        );
        this.selected = this.regions.length ? 0 : -1;
        this._updateList();
        this.redraw();
        this.status.textContent = `Imported ${this.regions.length} regions.`;
      } catch (error) {
        this.status.textContent = `Import failed: ${error.message}`;
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  }
}
