"""Split, merge, and region tracing of session outlines."""

import asyncio

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

import app.api.routes as routes
from app.config import ensure_user_dirs
from app.main import app
from app.models.schemas import FingerHole, Point, Polygon, Session
from app.services.outline_ops import (
    OutlineOpError,
    merge_polygons,
    split_polygon,
    to_shapely,
    trace_region,
)


def _rect(id: str, x0: float, y0: float, x1: float, y1: float, **kw) -> Polygon:
    return Polygon(
        id=id,
        label=kw.pop("label", id),
        points=[Point(x=x0, y=y0), Point(x=x1, y=y0), Point(x=x1, y=y1), Point(x=x0, y=y1)],
        **kw,
    )


def _pts(*xy: tuple[float, float]) -> list[Point]:
    return [Point(x=x, y=y) for x, y in xy]


def _label(n: int) -> str:
    return f"tool {n + 5}"


# --- split ---


def test_split_cuts_joined_objects_into_two_pieces():
    # two objects the tracer joined: 100x40 on the left, 60x40 on the right
    poly = _rect("a", 0, 0, 160, 40, label="pliers")
    pieces = split_polygon(poly, _pts((100, -10), (100, 50)), _label)

    assert len(pieces) == 2
    big, small = pieces
    # the larger piece keeps identity so selection and name survive
    assert (big.id, big.label) == ("a", "pliers")
    assert small.id != "a" and small.label == "tool 5"
    big_bounds = to_shapely(big).bounds
    small_bounds = to_shapely(small).bounds
    assert big_bounds[2] == pytest.approx(99.5, abs=0.01)
    assert small_bounds[0] == pytest.approx(100.5, abs=0.01)
    # only the thin cut strip is lost
    assert to_shapely(big).area + to_shapely(small).area == pytest.approx(160 * 40 - 40, abs=0.5)


def test_split_follows_a_bent_stroke():
    poly = _rect("a", 0, 0, 100, 100)
    # L-shaped stroke carves off the top-right quarter
    pieces = split_polygon(poly, _pts((50, -5), (50, 50), (105, 50)), _label)
    assert len(pieces) == 2
    assert to_shapely(pieces[1]).area == pytest.approx(50 * 50, rel=0.03)


def test_split_hands_finger_holes_to_the_piece_they_sit_in():
    hole_left = FingerHole(id="h1", x=20, y=20)
    hole_right = FingerHole(id="h2", x=140, y=20)
    poly = _rect("a", 0, 0, 160, 40, finger_holes=[hole_left, hole_right])
    big, small = split_polygon(poly, _pts((100, -10), (100, 50)), _label)
    assert [h.id for h in big.finger_holes] == ["h1"]
    assert [h.id for h in small.finger_holes] == ["h2"]


def test_split_rejects_a_stroke_that_does_not_cross():
    poly = _rect("a", 0, 0, 100, 100)
    with pytest.raises(OutlineOpError, match="cross"):
        split_polygon(poly, _pts((50, -10), (50, 60)), _label)


# --- merge ---


def test_merge_overlapping_outlines_is_their_union():
    merged = merge_polygons([_rect("a", 0, 0, 60, 40), _rect("b", 40, 0, 100, 40)])
    assert merged.id == "a"
    assert to_shapely(merged).area == pytest.approx(100 * 40)


def test_merge_bridges_a_small_gap():
    a = _rect("a", 0, 0, 50, 40, finger_holes=[FingerHole(id="h1", x=10, y=10)])
    b = _rect("b", 54, 0, 100, 40, finger_holes=[FingerHole(id="h2", x=80, y=10)])
    merged = merge_polygons([a, b])
    shape = to_shapely(merged)
    assert shape.geom_type == "Polygon"
    assert shape.contains(to_shapely(a)) and shape.contains(to_shapely(b))
    # the bridge fills the gap without swelling the outer outline
    assert shape.bounds == pytest.approx((0, 0, 100, 40), abs=0.5)
    assert {h.id for h in merged.finger_holes} == {"h1", "h2"}


def test_merge_refuses_outlines_far_apart():
    with pytest.raises(OutlineOpError, match="too far apart"):
        merge_polygons([_rect("a", 0, 0, 20, 20), _rect("b", 200, 0, 220, 20)])


# --- region trace ---


def _photo(tmp_path) -> str:
    """white paper with a dark 60x40 object at (50, 50)"""
    img = np.full((200, 240, 3), 245, np.uint8)
    cv2.rectangle(img, (50, 50), (109, 89), (40, 40, 40), -1)
    path = str(tmp_path / "corrected.png")
    cv2.imwrite(path, img)
    return path


def test_trace_region_finds_object_with_grabcut(tmp_path):
    poly = asyncio.run(trace_region(_photo(tmp_path), (35, 35, 90, 70), "tool 3"))
    minx, miny, maxx, maxy = to_shapely(poly).bounds
    assert poly.label == "tool 3"
    assert (minx, miny) == pytest.approx((50, 50), abs=3)
    assert (maxx, maxy) == pytest.approx((109, 89), abs=3)


def test_trace_region_prefers_the_saliency_model(tmp_path):
    seen = {}

    async def saliency(crop):
        seen["shape"] = crop.shape
        mask = np.zeros(crop.shape[:2], np.uint8)
        cv2.circle(mask, (45, 35), 20, 255, -1)
        return mask

    poly = asyncio.run(trace_region(_photo(tmp_path), (35, 35, 90, 70), "t", saliency))
    assert seen["shape"] == (70, 90, 3)
    minx, miny, maxx, maxy = to_shapely(poly).bounds
    # circle centred at crop (45, 35) -> image (80, 70), radius 20
    assert ((minx + maxx) / 2, (miny + maxy) / 2) == pytest.approx((80, 70), abs=2)
    assert maxx - minx == pytest.approx(40, abs=3)


def test_trace_region_falls_back_when_saliency_fails(tmp_path):
    async def saliency(crop):
        raise RuntimeError("provider down")

    poly = asyncio.run(trace_region(_photo(tmp_path), (35, 35, 90, 70), "t", saliency))
    assert to_shapely(poly).bounds == pytest.approx((50, 50, 109, 89), abs=3)


def test_trace_region_rejects_a_tiny_box(tmp_path):
    with pytest.raises(OutlineOpError, match="larger box"):
        asyncio.run(trace_region(_photo(tmp_path), (50, 50, 3, 3), "t"))


# --- routes ---


def _client(tmp_path, monkeypatch, tracers="isnet"):
    monkeypatch.setattr(routes.settings, "storage_path", tmp_path)
    monkeypatch.setattr(routes.settings, "tracers", tracers)
    routes._store_cache.clear()
    routes._tracers.clear()
    ensure_user_dirs(tmp_path / "default")
    proc = tmp_path / "default" / "processed"
    proc.mkdir(parents=True, exist_ok=True)
    img = np.full((200, 240, 3), 245, np.uint8)
    cv2.rectangle(img, (50, 50), (109, 89), (40, 40, 40), -1)
    cv2.imwrite(str(proc / "c.png"), img)
    sessions, _, _ = routes.get_stores("default")
    original = [_rect("a", 0, 0, 160, 40)]
    sessions.set("s1", Session(id="s1", corrected_image_path="default/processed/c.png", polygons=original))
    return TestClient(app)


def test_split_route_returns_pieces_without_saving(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    resp = client.post("/api/sessions/s1/polygons/split", json={
        "polygon": _rect("a", 0, 0, 160, 40).model_dump(),
        "cut": [{"x": 100, "y": -10}, {"x": 100, "y": 50}],
        "label_start": 4,
    })
    assert resp.status_code == 200
    pieces = resp.json()["polygons"]
    assert [p["id"] for p in pieces][0] == "a"
    assert pieces[1]["label"] == "tool 4"
    # the editor owns saving, so the stored session is untouched
    sessions, _, _ = routes.get_stores("default")
    assert len(sessions.get("s1").polygons) == 1


def test_split_route_reports_a_missed_cut(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    resp = client.post("/api/sessions/s1/polygons/split", json={
        "polygon": _rect("a", 0, 0, 160, 40).model_dump(),
        "cut": [{"x": 100, "y": -10}, {"x": 100, "y": 20}],
    })
    assert resp.status_code == 400
    assert "cross" in resp.json()["detail"]


def test_merge_route(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    resp = client.post("/api/sessions/s1/polygons/merge", json={
        "polygons": [_rect("a", 0, 0, 60, 40).model_dump(), _rect("b", 40, 0, 100, 40).model_dump()],
    })
    assert resp.status_code == 200
    (merged,) = resp.json()["polygons"]
    assert merged["id"] == "a"


def test_trace_region_route_uses_grabcut_for_gemini(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch, tracers="gemini")
    resp = client.post("/api/sessions/s1/trace-region", json={
        "x": 35, "y": 35, "width": 90, "height": 70, "tracer": "gemini", "label_start": 2,
    })
    assert resp.status_code == 200
    (poly,) = resp.json()["polygons"]
    assert poly["label"] == "tool 2"
    xs = [p["x"] for p in poly["points"]]
    assert min(xs) == pytest.approx(50, abs=3) and max(xs) == pytest.approx(109, abs=3)


def test_trace_region_route_uses_the_remote_model(tmp_path, monkeypatch):
    import app.services.remote_saliency as rs

    monkeypatch.setattr(routes.settings, "fal_key", "fal_x")
    calls = []

    async def fake(cfg, image_png, target_size, **kw):
        calls.append(target_size)
        mask = np.zeros((target_size[1], target_size[0]), np.uint8)
        mask[10:30, 10:50] = 255
        return mask

    monkeypatch.setattr(rs, "remote_saliency_mask", fake)
    client = _client(tmp_path, monkeypatch, tracers="fal")
    resp = client.post("/api/sessions/s1/trace-region", json={
        "x": 35, "y": 35, "width": 90, "height": 70, "tracer": "fal",
    })
    assert resp.status_code == 200
    assert calls == [(90, 70)]
    xs = [p["x"] for p in resp.json()["polygons"][0]["points"]]
    assert min(xs) == pytest.approx(45, abs=2) and max(xs) == pytest.approx(84, abs=2)


def test_outline_routes_need_a_corrected_image(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    sessions, _, _ = routes.get_stores("default")
    sessions.set("s2", Session(id="s2"))
    resp = client.post("/api/sessions/s2/trace-region", json={"x": 0, "y": 0, "width": 50, "height": 50})
    assert resp.status_code == 400


def test_merging_split_pieces_restores_a_lean_outline():
    """splitting then merging should not bloat the outline with arc vertices"""
    ring = [(50 + 40 * np.cos(t), 50 + 40 * np.sin(t)) for t in np.linspace(0, 2 * np.pi, 60, endpoint=False)]
    poly = Polygon(id="a", label="a", points=[Point(x=x, y=y) for x, y in ring])
    pieces = split_polygon(poly, _pts((50, 0), (50, 100)), _label)
    merged = merge_polygons(pieces)
    shape = to_shapely(merged)
    assert shape.area == pytest.approx(to_shapely(poly).area, rel=0.01)
    assert len(merged.points) <= len(poly.points) + 8


def test_trace_region_box_covering_the_whole_image(tmp_path):
    """GrabCut has no outside background to learn from; must still trace"""
    poly = asyncio.run(trace_region(_photo(tmp_path), (0, 0, 240, 200), "t"))
    assert to_shapely(poly).bounds == pytest.approx((50, 50, 109, 89), abs=4)


def test_trace_region_smallest_accepted_box(tmp_path):
    async def saliency(crop):
        return np.full(crop.shape[:2], 255, np.uint8)

    poly = asyncio.run(trace_region(_photo(tmp_path), (60, 60, 8, 8), "t", saliency))
    assert to_shapely(poly).area > 0
