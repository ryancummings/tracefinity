# Tool Editor

Open the editor by clicking a tool in your library. The toolbar controls what happens when you click or drag on the canvas.

## Editing modes

**Select** -- drag vertices and cutouts to reposition them.

**Add point** -- click on an edge to insert a new vertex. Disabled in smooth mode.

**Remove** -- click a vertex to delete it. Disabled when the shape has 3 or fewer vertices, or in smooth mode.

**Fill in** -- only appears when the tool has interior rings (donut shapes). Click a ring to fill it solid.

## Cutouts

The cutout dropdown provides six pocket types. Click on the canvas to place one. New cutout sizes come from the Settings page.

| Type | Default size | Shape |
|-|-|-|
| Finger scoop | 15mm radius | Flat floor with a tapered opening for getting under a tool |
| Circle | 10mm radius | Spherical pocket |
| Cylinder | 10mm radius | Flat-bottomed circular pocket |
| Square | 20mm side | Square pocket |
| Rectangle | 30 x 20mm | Rectangular pocket |
| Filleted rectangle | 30 x 20mm | Rounded bottom corners |

Once placed:

- Drag to move any cutout.
- Corner handles to resize circle, cylinder, square, and rectangle cutouts.
- Rotation handle on rectangular cutouts.
- Per-hole depth override (overrides the bin's cutout depth for this hole only).
- Select a hole and click Delete to remove it.

The bin editor also places cutouts on individual tool placements. Choose Add cutout, select the tool that will own it, then click where the cutout should go. The target tool is highlighted and named while you place cutouts. Select a cutout to drag it or use its inspector to change its shape, dimensions, position, rotation, and depth. Round cutouts also have a drag handle for resizing. These changes belong to that bin; source tool cutouts still update other bins. Select a tool in the bin editor to open its settings panel and set its pocket depth. The tool uses the bin's Cutout Depth until you enter a different value; an individual cutout can override that depth again. Settings holds saved cutout sizes, default text size, and new-bin options.

## Smooth vs Accurate

The editor always opens in the **Accurate** view so the editable vertices are
visible. Toggle the canvas preview using the Accurate/Smooth buttons; this does
not change which outline bins and exports use.

**Accurate** -- the raw traced polygon with all vertices. You can add, remove, and drag points.

**Smooth** -- a simplified outline. A slider controls smoothing aggressiveness: range 0 to 1, step 0.05. Uses physically bounded Chaikin subdivision, which stays within the control polygon without bowing long straight runs. Vertex editing is unavailable in this preview.

Use the separate **Output: Smooth/Accurate** button to choose which outline is
used for bins and SVG exports. This preference is saved with the tool.

## Transforms

- Rotate 90 degrees clockwise or anticlockwise.
- Flip horizontally or vertically.
- Auto-rotate: finds the rotation angle that minimises the bounding box. Runs on the backend.
- Free-rotate by dragging the rotation handle near the centroid.

## Grid snap

Toggle the Snap button to snap vertices to a 5mm grid. Off by default so outline corrections keep their traced precision. Grid lines are drawn at 10mm intervals for reference.

## Undo / Redo

Ctrl+Z to undo, Ctrl+Shift+Z to redo. Up to 50 steps of history.

## Zoom and pan

Scroll to zoom (0.5x to 20x). Pan by middle-click drag or hold Space and drag.

## Source image overlay

Toggle the source image behind the polygon outline. An opacity slider controls visibility.

## SVG export

Download the tool outline as an SVG file from the tool page header.
