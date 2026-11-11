"""Write the Parquet test fixtures in src/lib/__fixtures__/ to netgamut's mirror format 2.

Run: uv run --with pyarrow python scripts/parquet-fixtures.py
"""

from datetime import datetime, timezone
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

OUT = Path(__file__).resolve().parent.parent / "src" / "lib" / "__fixtures__"


def write(name: str, table: pa.Table, key: str, directed: bool) -> None:
    meta = {
        "netgamut:key": key,
        "netgamut:title": key.split("/")[-1],
        "netgamut:url": "https://example.org/" + key,
        "netgamut:citation": "A. Author, Example (2026)\nB. Author, Another (2025)",
        "netgamut:directed": "true" if directed else "false",
        "netgamut:version": "0.5.0",
    }
    table = table.replace_schema_metadata({**(table.schema.metadata or {}), **meta})
    pq.write_table(table, OUT / name, compression="zstd", row_group_size=1_000_000)


OUT.mkdir(parents=True, exist_ok=True)

# Two triangles joined by one link; 7 is only in the links, 9 only in the nodes (an isolate).
write(
    "toy.links.parquet",
    pa.table(
        {
            "source": pa.array([1, 1, 2, 4, 4, 5, 3, 3], pa.int32()),
            "target": pa.array([2, 3, 3, 5, 6, 6, 4, 7], pa.int32()),
            "weight": pa.array([1.0, 1.0, 1.0, 2.0, 2.0, 2.0, 0.5, 1.5], pa.float64()),
            "time": pa.array(
                [datetime(2020, 1, d, tzinfo=timezone.utc) for d in range(1, 9)],
                pa.timestamp("ms", tz="UTC"),
            ),
        }
    ),
    "test/toy",
    False,
)
write(
    "toy.nodes.parquet",
    pa.table(
        {
            "id": pa.array([1, 2, 3, 4, 5, 6, 9], pa.int32()),
            "name": pa.array(["one", "two", "three", "four", "five", "six", "nine"]),
            "group": pa.array(["a", "a", "b", None, "b", "b", "c"]).dictionary_encode(),
            "size": pa.array([10, 20, 30, 40, None, 60, 90], pa.int64()),
            "score": pa.array([0.5, None, 1.5, 2.5, 3.5, 4.5, 9.5], pa.float64()),
        }
    ),
    "test/toy",
    False,
)

# String ids, directed, no nodes table.
write(
    "named.links.parquet",
    pa.table({"source": ["a", "b", "c", "a"], "target": ["b", "c", "a", "c"]}),
    "test/named",
    True,
)

# Integer ids past int32: int64, numbered by the Navigator.
write(
    "wide.links.parquet",
    pa.table(
        {
            "source": pa.array([2**40, 2**40 + 1, 2**62], pa.int64()),
            "target": pa.array([2**40 + 1, 2**62, 2**40], pa.int64()),
        }
    ),
    "test/wide",
    False,
)

# Two named layers over the same three nodes, no links between layers.
write(
    "layers.links.parquet",
    pa.table(
        {
            "source": pa.array([1, 2, 3, 1, 2], pa.int32()),
            "target": pa.array([2, 3, 1, 2, 3], pa.int32()),
            "weight": pa.array([1.0, 1.0, 1.0, 3.0, 3.0], pa.float64()),
            "layer": ["bus", "bus", "bus", "tram", "tram"],
        }
    ),
    "test/layers",
    False,
)
write(
    "layers.nodes.parquet",
    pa.table(
        {
            "id": pa.array([1, 2, 3], pa.int32()),
            "name": ["A", "B", "C"],
            "zone": pa.array([1, 1, 2], pa.int64()),
        }
    ),
    "test/layers",
    False,
)
