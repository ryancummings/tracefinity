import math

from app.models.schemas import Point


def sync_placed_tools(bin_data, user_tools) -> bool:
    """sync placed tools with their library versions. returns True if any changed."""
    changed = False
    for pt in bin_data.placed_tools:
        if not pt.tool_id:
            continue
        tool = user_tools.get(pt.tool_id)
        if not tool or not tool.points:
            continue

        n_placed = len(pt.points)
        placed_cx = sum(p.x for p in pt.points) / n_placed
        placed_cy = sum(p.y for p in pt.points) / n_placed

        n_lib = len(tool.points)
        lib_cx = sum(p.x for p in tool.points) / n_lib
        lib_cy = sum(p.y for p in tool.points) / n_lib

        rot = math.radians(pt.rotation)
        cos_r, sin_r = math.cos(rot), math.sin(rot)

        new_points = []
        for p in tool.points:
            rx = (p.x - lib_cx) * cos_r - (p.y - lib_cy) * sin_r
            ry = (p.x - lib_cx) * sin_r + (p.y - lib_cy) * cos_r
            new_points.append(Point(x=placed_cx + rx, y=placed_cy + ry))

        # preserve per-placement state (depth_override, etc.) by matching
        # source-tool holes to existing placed holes by id. without this,
        # GET /bins/{id} silently overwrites stored overrides on every load.
        # a hole the placement has not seen yet keeps the library value.
        existing_holes = {fh.id: fh for fh in pt.finger_holes}
        new_fh = []
        for fh in tool.finger_holes:
            existing = existing_holes.get(fh.id)
            if existing and existing.bin_override:
                new_fh.append(existing)
                continue
            rx = (fh.x - lib_cx) * cos_r - (fh.y - lib_cy) * sin_r
            ry = (fh.x - lib_cx) * sin_r + (fh.y - lib_cy) * cos_r
            new_fh.append(fh.model_copy(update={
                "x": placed_cx + rx, "y": placed_cy + ry,
                "rotation": fh.rotation + pt.rotation,
                "depth_override": existing.depth_override if existing else fh.depth_override,
            }))
        # Bin-created holes belong to this placement and have no library peer.
        source_ids = {fh.id for fh in tool.finger_holes}
        new_fh.extend(fh for fh in pt.finger_holes if fh.bin_override and fh.id not in source_ids)

        new_rings = []
        for ring in (tool.interior_rings or []):
            new_ring = []
            for p in ring:
                rx = (p.x - lib_cx) * cos_r - (p.y - lib_cy) * sin_r
                ry = (p.x - lib_cx) * sin_r + (p.y - lib_cy) * cos_r
                new_ring.append(Point(x=placed_cx + rx, y=placed_cy + ry))
            new_rings.append(new_ring)

        if new_points != pt.points or new_fh != pt.finger_holes or new_rings != pt.interior_rings:
            pt.points = new_points
            pt.finger_holes = new_fh
            pt.interior_rings = new_rings
            pt.name = tool.name
            changed = True

    return changed
