"""Static payloads for the fake Home Assistant server.

Mirrors HA core at pin HA_CORE_PIN (sparse read only; behavior, not code).
Three color lights plus one color_temp-only light, and matching entity
registry entries carrying each entry's integration platform.
"""

# Sparse-clone pin the emulated behaviors were read from. Recorded here so a
# later drift check knows what this fake was built against.
HA_CORE_PIN = "f66cbe4"
HA_VERSION = "2026.9.0"

# Long-lived-style dev token accepted by the fake without any OAuth round
# trip. Real HA mints these per user; here it is a fixed string so scripted
# clients and check.py can skip the browser flow.
DEV_ACCESS_TOKEN = "fake-dev-token"

# Zone/viz order: index in LIGHTS doubles as the light-viz-relay zone id when
# --viz-forward is on.
LIGHTS = [
    {
        "entity_id": "light.living_room",
        "friendly_name": "Living Room",
        "platform": "hue",
        "supported_color_modes": ["rgb"],
        "state": "on",
        "brightness": 255,
        "rgb_color": [255, 255, 255],
    },
    {
        "entity_id": "light.kitchen_strip",
        "friendly_name": "Kitchen Strip",
        "platform": "wled",
        "supported_color_modes": ["rgbw"],
        "state": "on",
        "brightness": 200,
        "rgb_color": [255, 255, 255],
    },
    {
        "entity_id": "light.desk_glow",
        "friendly_name": "Desk Glow",
        "platform": "lifx",
        "supported_color_modes": ["xy"],
        "state": "off",
    },
    {
        "entity_id": "light.hallway_bulb",
        "friendly_name": "Hallway Bulb",
        "platform": "zwave_js",
        "supported_color_modes": ["color_temp"],
        "state": "on",
        "brightness": 255,
        "color_temp_kelvin": 2700,
    },
]


def state_response(light):
    """One get_states entry for a light dict (copy; never the live object)."""
    attributes = {
        "friendly_name": light["friendly_name"],
        "supported_color_modes": list(light["supported_color_modes"]),
        "supported_features": 0,
    }
    for key in ("brightness", "rgb_color", "color_temp_kelvin"):
        if key in light:
            value = light[key]
            attributes[key] = list(value) if isinstance(value, list) else value
    return {
        "entity_id": light["entity_id"],
        "state": light["state"],
        "attributes": attributes,
        "last_changed": "2026-10-02T00:00:00+00:00",
        "last_updated": "2026-10-02T00:00:00+00:00",
    }


def registry_entry(index, light):
    """One config/entity_registry/list entry (platform is what matters)."""
    return {
        "entity_id": light["entity_id"],
        "name": light["friendly_name"],
        "platform": light["platform"],
        "device_id": "fake-device-%d" % index,
        "area_id": None,
        "disabled_by": None,
        "entity_category": None,
    }
