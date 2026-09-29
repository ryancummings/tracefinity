"""Tests that sync_placed_tools preserves per-placement state across loads.

Regression: GET /bins/{id} runs sync_placed_tools, which rebuilt finger_holes
from the source tool and dropped depth_override; the diff check then wrote
the cleared bin back to disk, permanently losing user overrides.
"""
from app.models.schemas import BinConfig, BinModel, FingerHole, PlacedTool, Point, Tool
from app.services.bin_service import sync_placed_tools


class _Store:
    def __init__(self, items):
        self._d = {item.id: item for item in items}

    def get(self, key):
        return self._d.get(key)


def _make_source_tool(tool_id="tool1", hole_ids=("h1",)):
    return Tool(
        id=tool_id,
        name="hammer",
        points=[Point(x=0, y=0), Point(x=10, y=0), Point(x=10, y=10), Point(x=0, y=10)],
        finger_holes=[FingerHole(id=hid, x=5, y=5, radius=2.0, shape="circle") for hid in hole_ids],
        interior_rings=[],
    )


def _make_bin_with_placed(tool_id, hole_ids, depth_override=None, hole_depth_overrides=None):
    hole_depth_overrides = hole_depth_overrides or {}
    placed = PlacedTool(
        id="placement1",
        tool_id=tool_id,
        name="hammer",
        points=[Point(x=20, y=20), Point(x=30, y=20), Point(x=30, y=30), Point(x=20, y=30)],
        finger_holes=[
            FingerHole(
                id=hid, x=25, y=25, radius=2.0, shape="circle",
                depth_override=hole_depth_overrides.get(hid),
            )
            for hid in hole_ids
        ],
        interior_rings=[],
        depth_override=depth_override,
    )
    return BinModel(id="bin1", bin_config=BinConfig(), placed_tools=[placed])


class TestSyncPreservesOverrides:
    def test_bin_cutout_edits_and_new_holes_survive_sync(self):
        bin_data = _make_bin_with_placed("tool1", ["h1"])
        placed = bin_data.placed_tools[0]
        placed.finger_holes[0] = FingerHole(
            id="h1", x=28, y=29, radius=4, shape="scoop",
            bin_override=True, depth_override=12,
        )
        placed.finger_holes.append(FingerHole(
            id="bin-fh-extra", x=31, y=26, radius=6,
            shape="scoop", bin_override=True,
        ))

        sync_placed_tools(bin_data, _Store([_make_source_tool("tool1")]))

        holes = {fh.id: fh for fh in placed.finger_holes}
        assert set(holes) == {"h1", "bin-fh-extra"}
        assert (holes["h1"].x, holes["h1"].y, holes["h1"].radius, holes["h1"].shape) == (28, 29, 4, "scoop")
        assert holes["h1"].depth_override == 12

    def test_placement_can_hide_library_hole(self):
        bin_data = _make_bin_with_placed("tool1", ["h1"])
        bin_data.placed_tools[0].finger_holes[0].disabled = True
        bin_data.placed_tools[0].finger_holes[0].bin_override = True
        sync_placed_tools(bin_data, _Store([_make_source_tool("tool1")]))
        assert bin_data.placed_tools[0].finger_holes[0].disabled

    def test_source_rectangle_orientation_tracks_placed_tool(self):
        tool = _make_source_tool()
        tool.finger_holes[0].shape = "rectangle"
        tool.finger_holes[0].width = 12
        tool.finger_holes[0].height = 5
        tool.finger_holes[0].rotation = 15
        bin_data = _make_bin_with_placed("tool1", ["h1"])
        bin_data.placed_tools[0].rotation = 30
        sync_placed_tools(bin_data, _Store([tool]))
        assert bin_data.placed_tools[0].finger_holes[0].rotation == 45

    def test_per_hole_depth_override_survives_sync(self):
        bin_data = _make_bin_with_placed("tool1", ["h1"], hole_depth_overrides={"h1": 25.0})
        tools = _Store([_make_source_tool("tool1", ("h1",))])

        sync_placed_tools(bin_data, tools)

        assert bin_data.placed_tools[0].finger_holes[0].depth_override == 25.0

    def test_per_tool_depth_override_survives_sync(self):
        bin_data = _make_bin_with_placed("tool1", ["h1"], depth_override=30.0)
        tools = _Store([_make_source_tool("tool1", ("h1",))])

        sync_placed_tools(bin_data, tools)

        assert bin_data.placed_tools[0].depth_override == 30.0

    def test_new_source_hole_gets_no_override(self):
        # source tool gains a new hole h2; placed should pick it up with no override
        bin_data = _make_bin_with_placed("tool1", ["h1"], hole_depth_overrides={"h1": 25.0})
        tools = _Store([_make_source_tool("tool1", ("h1", "h2"))])

        sync_placed_tools(bin_data, tools)

        holes = {fh.id: fh for fh in bin_data.placed_tools[0].finger_holes}
        assert holes["h1"].depth_override == 25.0
        assert holes["h2"].depth_override is None

    def test_no_override_means_no_change_to_override_field(self):
        bin_data = _make_bin_with_placed("tool1", ["h1"])
        tools = _Store([_make_source_tool("tool1", ("h1",))])

        sync_placed_tools(bin_data, tools)

        assert bin_data.placed_tools[0].finger_holes[0].depth_override is None
