"""Editing operations on traced outlines: split, merge, and tracing one region.

All coordinates are pixels in the corrected image, matching session polygons.
The operations return new polygons and never touch the stored session; the
editor applies them through its normal undo history and autosave."""

import logging
import uuid
from collections.abc import Awaitable, Callable

import cv2
import numpy as np
from shapely.geometry import LineString
from shapely.geometry import Point as ShapelyPoint
from shapely.geometry import Polygon as ShapelyPolygon
from shapely.ops import unary_union

from app.models.schemas import FingerHole, Point, Polygon
from app.services.ai_tracer import contours_from_binary

logger = logging.getLogger(__name__)

# width of the strip a cut removes; small enough to be invisible in the bin
CUT_WIDTH_PX = 1.0
# a piece smaller than this share of the original is a sliver the cut grazed
MIN_PIECE_FRACTION = 0.005
# merge closes gaps up to this share of the combined outline's larger side
MAX_MERGE_GAP_FRACTION = 0.08
# vertices closer than this to the outline are dropped after merging
MERGE_SIMPLIFY_PX = 0.5
MIN_REGION_PX = 8
GRABCUT_ITERATIONS = 5


class OutlineOpError(ValueError):
    """the requested edit cannot produce a sensible outline"""


def to_shapely(poly: Polygon) -> ShapelyPolygon:
    shape = ShapelyPolygon(
        [(p.x, p.y) for p in poly.points],
        holes=[[(p.x, p.y) for p in ring] for ring in poly.interior_rings if len(ring) >= 3],
    )
    if not shape.is_valid:
        shape = shape.buffer(0)
    return shape


def _parts(geom) -> list[ShapelyPolygon]:
    if geom.is_empty:
        return []
    if geom.geom_type == "Polygon":
        return [geom]
    if hasattr(geom, "geoms"):
        return [g for sub in geom.geoms for g in _parts(sub)]
    return []


def _ring_points(coords) -> list[Point]:
    return [Point(x=float(x), y=float(y)) for x, y in list(coords)[:-1]]


def _from_shapely(shape: ShapelyPolygon, id: str, label: str, finger_holes: list[FingerHole]) -> Polygon:
    return Polygon(
        id=id,
        points=_ring_points(shape.exterior.coords),
        label=label,
        finger_holes=finger_holes,
        interior_rings=[_ring_points(ring.coords) for ring in shape.interiors if len(ring.coords) >= 4],
    )


def split_polygon(poly: Polygon, cut: list[Point], new_label: Callable[[int], str]) -> list[Polygon]:
    """cut an outline along a drawn stroke. the largest piece keeps the
    original id and label so selections and names survive; the rest get
    fresh ids and labels from new_label(n) for n = 0, 1, ..."""
    if len(cut) < 2:
        raise OutlineOpError("draw a cut line across the outline")
    shape = to_shapely(poly)
    stroke = LineString([(p.x, p.y) for p in cut])
    if stroke.length == 0:
        raise OutlineOpError("draw a cut line across the outline")

    remainder = shape.difference(stroke.buffer(CUT_WIDTH_PX / 2))
    min_area = shape.area * MIN_PIECE_FRACTION
    pieces = sorted(
        (p for p in _parts(remainder) if p.area >= min_area),
        key=lambda p: p.area,
        reverse=True,
    )
    if len(pieces) < 2:
        raise OutlineOpError("the cut must cross the outline from one side to the other")

    holes_by_piece: list[list[FingerHole]] = [[] for _ in pieces]
    for hole in poly.finger_holes:
        centre = ShapelyPoint(hole.x, hole.y)
        idx = min(range(len(pieces)), key=lambda i: pieces[i].distance(centre))
        holes_by_piece[idx].append(hole)

    result = [_from_shapely(pieces[0], poly.id, poly.label, holes_by_piece[0])]
    for n, piece in enumerate(pieces[1:]):
        result.append(_from_shapely(piece, str(uuid.uuid4()), new_label(n), holes_by_piece[n + 1]))
    return result


def merge_polygons(polys: list[Polygon]) -> Polygon:
    """union outlines into the first one. outlines that do not quite touch
    are joined by closing the gap between them, up to a limit."""
    if len(polys) < 2:
        raise OutlineOpError("pick at least two outlines to merge")
    shapes = [to_shapely(p) for p in polys]
    merged = unary_union(shapes)
    if len(_parts(merged)) > 1:
        minx, miny, maxx, maxy = merged.bounds
        max_gap = max(maxx - minx, maxy - miny) * MAX_MERGE_GAP_FRACTION
        gap = 2.0
        while len(_parts(merged)) > 1 and gap <= max_gap:
            # closing: grow then shrink bridges the gap without swelling the
            # outline; mitred joins keep corners sharp instead of adding arcs
            closed = merged.buffer(gap, join_style="mitre").buffer(-gap, join_style="mitre")
            merged = unary_union([closed, *shapes])
            gap *= 2
        # drop the collinear points the union leaves along the old seam
        merged = merged.simplify(MERGE_SIMPLIFY_PX, preserve_topology=True)
    parts = _parts(merged)
    if len(parts) != 1:
        raise OutlineOpError("those outlines are too far apart to merge")
    first = polys[0]
    holes = [h for p in polys for h in p.finger_holes]
    return _from_shapely(parts[0], first.id, first.label, holes)


def _clamp_rect(rect: tuple[float, float, float, float], w: int, h: int) -> tuple[int, int, int, int]:
    x, y, rw, rh = rect
    x0 = max(0, min(w, int(round(x))))
    y0 = max(0, min(h, int(round(y))))
    x1 = max(0, min(w, int(round(x + rw))))
    y1 = max(0, min(h, int(round(y + rh))))
    if x1 - x0 < MIN_REGION_PX or y1 - y0 < MIN_REGION_PX:
        raise OutlineOpError("drag a larger box around the object")
    return x0, y0, x1 - x0, y1 - y0


def grabcut_mask(img: np.ndarray, rect: tuple[int, int, int, int]) -> np.ndarray:
    """foreground (255) inside rect by GrabCut, seeded with everything
    outside the box as background. a box touching the image edge is inset
    by a pixel there, since GrabCut needs some background to learn from."""
    h, w = img.shape[:2]
    x, y, rw, rh = rect
    x0, y0 = max(x, 1), max(y, 1)
    x1, y1 = min(x + rw, w - 1), min(y + rh, h - 1)
    mask = np.zeros((h, w), np.uint8)
    bgd = np.zeros((1, 65), np.float64)
    fgd = np.zeros((1, 65), np.float64)
    cv2.grabCut(img, mask, (x0, y0, x1 - x0, y1 - y0), bgd, fgd, GRABCUT_ITERATIONS, cv2.GC_INIT_WITH_RECT)
    return np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)


SaliencyFn = Callable[[np.ndarray], Awaitable[np.ndarray]]


async def trace_region(
    image_path: str,
    rect: tuple[float, float, float, float],
    label: str,
    saliency: SaliencyFn | None = None,
) -> Polygon:
    """trace the single most prominent object inside rect (x, y, w, h).

    saliency, when given, maps a BGR crop to a same-size fg=255 mask using
    the configured tracer model. GrabCut is the fallback when there is no
    model or the model finds nothing in the box."""
    img = cv2.imread(image_path)
    if img is None:
        raise OutlineOpError("failed to read the corrected image")
    h, w = img.shape[:2]
    x, y, rw, rh = _clamp_rect(rect, w, h)

    full = np.zeros((h, w), np.uint8)
    # ignore specks, but never demand more than a quarter of a small box
    min_area = max(min(100, rw * rh // 4), int(rw * rh * 0.01))
    if saliency is not None:
        try:
            crop_mask = await saliency(img[y:y + rh, x:x + rw])
        except Exception:
            logger.warning("saliency failed on region; falling back to GrabCut", exc_info=True)
            crop_mask = None
        if crop_mask is not None and int(np.count_nonzero(crop_mask)) >= min_area:
            full[y:y + rh, x:x + rw] = crop_mask
    if not full.any():
        full[y:y + rh, x:x + rw] = grabcut_mask(img, (x, y, rw, rh))[y:y + rh, x:x + rw]

    contours = contours_from_binary(full, w, h, min_area=min_area)
    if not contours:
        raise OutlineOpError("no object found in that box; try drawing the outline by hand")
    exterior, holes = max(contours, key=lambda c: ShapelyPolygon(c[0]).area)
    return Polygon(
        id=str(uuid.uuid4()),
        points=[Point(x=px, y=py) for px, py in exterior],
        label=label,
        interior_rings=[[Point(x=px, y=py) for px, py in ring] for ring in holes],
    )
