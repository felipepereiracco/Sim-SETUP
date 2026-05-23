"""Modular catalog loader for racing titles and their car/track datasets."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).parent / "data"
DEFAULT_GAME_ID = "ac_evo"


class DataRegistry:
    """Loads game manifests and per-title JSON catalogs with in-memory caching."""

    def __init__(self, data_dir: Path | None = None) -> None:
        self.data_dir = data_dir or DATA_DIR
        self._manifest: dict[str, Any] | None = None

    @property
    def manifest(self) -> dict[str, Any]:
        if self._manifest is None:
            with open(self.data_dir / "manifest.json", encoding="utf-8") as f:
                self._manifest = json.load(f)
        return self._manifest

    def list_games(self) -> list[dict[str, Any]]:
        return [g for g in self.manifest.get("games", []) if g.get("active", True)]

    def get_game(self, game_id: str) -> dict[str, Any] | None:
        return next((g for g in self.manifest.get("games", []) if g["id"] == game_id), None)

    def _load_dataset(self, game_id: str, dataset: str) -> list[dict[str, Any]]:
        game = self.get_game(game_id)
        if not game:
            raise ValueError(f"Unknown game: {game_id}")
        filename = game.get("data_files", {}).get(dataset)
        if not filename:
            raise ValueError(f"Game {game_id} has no {dataset} dataset")
        path = self.data_dir / filename
        with open(path, encoding="utf-8") as f:
            return json.load(f)

    def get_cars(self, game_id: str = DEFAULT_GAME_ID) -> list[dict[str, Any]]:
        return sorted(self._load_dataset(game_id, "cars"), key=lambda c: c["name"])

    def get_tracks(self, game_id: str = DEFAULT_GAME_ID) -> list[dict[str, Any]]:
        return sorted(
            self._load_dataset(game_id, "tracks"),
            key=lambda t: (t["name"], t.get("layout", "")),
        )

    def find_car(self, car_id: str, game_id: str = DEFAULT_GAME_ID) -> dict[str, Any] | None:
        return next((c for c in self.get_cars(game_id) if c["id"] == car_id), None)

    def find_track(self, track_id: str, game_id: str = DEFAULT_GAME_ID) -> dict[str, Any] | None:
        return next((t for t in self.get_tracks(game_id) if t["id"] == track_id), None)


@lru_cache(maxsize=1)
def default_registry() -> DataRegistry:
    return DataRegistry()
