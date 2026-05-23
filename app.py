import os

from flask import Flask, jsonify, render_template, request

from data_registry import default_registry
from setup_engine import (
    VALID_GOALS,
    VALID_PRIORITIES,
    find_car,
    find_track,
    generate_setup,
    get_cars,
    get_tracks,
)

app = Flask(__name__)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/games")
def api_games():
    return jsonify(default_registry().list_games())


@app.route("/api/cars")
def api_cars():
    game_id = request.args.get("game_id", "ac_evo")
    return jsonify(get_cars(game_id))


@app.route("/api/tracks")
def api_tracks():
    game_id = request.args.get("game_id", "ac_evo")
    return jsonify(get_tracks(game_id))


@app.route("/api/setup", methods=["POST"])
def api_setup():
    data = request.get_json(silent=True) or {}
    car_id = data.get("car_id")
    track_id = data.get("track_id")
    goal = data.get("goal", "balanced_handling")
    priority = data.get("priority", "balanced")
    laps = data.get("laps", 10)
    game_id = data.get("game_id", "ac_evo")

    if not car_id or not track_id:
        return jsonify({"error": "car_id and track_id are required"}), 400

    if not find_car(car_id, game_id) or not find_track(track_id, game_id):
        return jsonify({"error": "Invalid car or track selection"}), 404

    try:
        laps_int = int(laps)
    except (TypeError, ValueError):
        return jsonify({"error": "laps must be a number between 1 and 200"}), 400

    try:
        setup = generate_setup(
            car_id,
            track_id,
            goal=goal,
            laps=laps_int,
            priority=priority,
            game_id=game_id,
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    return jsonify(setup)


@app.route("/api/meta")
def api_meta():
    return jsonify({
        "goals": sorted(VALID_GOALS),
        "priorities": sorted(VALID_PRIORITIES),
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    debug = os.environ.get("FLASK_DEBUG", "1") == "1"
    app.run(host="127.0.0.1", port=port, debug=debug)
