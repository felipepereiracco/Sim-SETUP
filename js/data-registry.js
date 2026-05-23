/** Client-side catalog loader for racing titles and JSON datasets. */
(function (global) {
  const DEFAULT_GAME_ID = "ac_evo";

  class DataRegistry {
    constructor(manifest, basePath = "data") {
      this.manifest = manifest;
      this.basePath = basePath.replace(/\/$/, "");
      this._cache = {};
    }

    listGames() {
      return (this.manifest.games || []).filter((g) => g.active !== false);
    }

    getGame(gameId) {
      return (this.manifest.games || []).find((g) => g.id === gameId);
    }

    async loadDataset(gameId, dataset) {
      const key = `${gameId}:${dataset}`;
      if (this._cache[key]) return this._cache[key];
      const game = this.getGame(gameId);
      if (!game) throw new Error(`Unknown game: ${gameId}`);
      const filename = game.data_files?.[dataset];
      if (!filename) throw new Error(`Game ${gameId} has no ${dataset} dataset`);
      const res = await fetch(`${this.basePath}/${filename}`);
      if (!res.ok) throw new Error(`Failed to load ${filename}`);
      const data = await res.json();
      this._cache[key] = data;
      return data;
    }

    async getCars(gameId = DEFAULT_GAME_ID) {
      const cars = await this.loadDataset(gameId, "cars");
      return [...cars].sort((a, b) => a.name.localeCompare(b.name));
    }

    async getTracks(gameId = DEFAULT_GAME_ID) {
      const tracks = await this.loadDataset(gameId, "tracks");
      return [...tracks].sort((a, b) => {
        const c = a.name.localeCompare(b.name);
        return c !== 0 ? c : (a.layout || "").localeCompare(b.layout || "");
      });
    }

    async findCar(carId, gameId = DEFAULT_GAME_ID) {
      const cars = await this.getCars(gameId);
      return cars.find((c) => c.id === carId) || null;
    }

    async findTrack(trackId, gameId = DEFAULT_GAME_ID) {
      const tracks = await this.getTracks(gameId);
      return tracks.find((t) => t.id === trackId) || null;
    }
  }

  async function createDataRegistry(basePath = "data") {
    const res = await fetch(`${basePath}/manifest.json`);
    if (!res.ok) throw new Error("Failed to load game manifest");
    const manifest = await res.json();
    return new DataRegistry(manifest, basePath);
  }

  global.DEFAULT_GAME_ID = DEFAULT_GAME_ID;
  global.DataRegistry = DataRegistry;
  global.createDataRegistry = createDataRegistry;
})(window);
