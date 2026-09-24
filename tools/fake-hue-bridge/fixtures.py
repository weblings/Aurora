"""Static bridge payloads for the tier-1 fake Hue bridge.

Shapes mirror what Aurora's output/hue slice actually parses (see
output/hue/src/ApiTools.cpp and the fixtures in
output/hue/tests/ApiToolsTests.cpp). Deliberately keeps the two id spaces
distinct -- channel members use ``ent-N`` (entertainment rids) while light
control uses ``light-N`` (light rids), exactly like a real bridge.
"""

DEV_USERNAME = "fakedevuser01"
DEV_CLIENTKEY = "00112233445566778899aabbccddeeff"

BRIDGE_NAME = "Fake Hue Bridge"
BRIDGE_ID = "ECB5FAFFFE123456"

DEVICES = [
    {
        "entertainment_id": "ent-1",
        "light_id": "light-1",
        "name": "Lamp A",
        "on": True,
        "brightness": 100.0,
        "xy": {"x": 0.4512, "y": 0.4080},
    },
    {
        "entertainment_id": "ent-2",
        "light_id": "light-2",
        "name": "Floor Lamp",
        "on": True,
        "brightness": 80.0,
        "xy": {"x": 0.3127, "y": 0.3290},
    },
    # Dedicated to conf-room-4zone below -- kept separate from Lamp A/Floor
    # Lamp above so existing living-room/office tests stay untouched.
    {
        "entertainment_id": "ent-3",
        "light_id": "light-3",
        "name": "Front Left Lamp",
        "on": True,
        "brightness": 100.0,
        "xy": {"x": 0.4, "y": 0.4},
    },
    {
        "entertainment_id": "ent-4",
        "light_id": "light-4",
        "name": "Front Right Lamp",
        "on": True,
        "brightness": 100.0,
        "xy": {"x": 0.4, "y": 0.4},
    },
    {
        "entertainment_id": "ent-5",
        "light_id": "light-5",
        "name": "Back Left Lamp",
        "on": True,
        "brightness": 100.0,
        "xy": {"x": 0.4, "y": 0.4},
    },
    {
        "entertainment_id": "ent-6",
        "light_id": "light-6",
        "name": "Back Right Lamp",
        "on": True,
        "brightness": 100.0,
        "xy": {"x": 0.4, "y": 0.4},
    },
]

# Three configs on purpose: a bridge holding more than one entertainment
# configuration over the same lights is normal, not an edge case.
CONFIGS = [
    {"id": "conf-living-room", "name": "Living Room",
     "channels": {0: ["ent-1"], 1: ["ent-2"]}},
    {"id": "conf-office", "name": "Office",
     "channels": {0: ["ent-2"]}},
    # For Aurora-gj0 (light-viz tool): 4 channels, one per web/demo/main.js's
    # ROOM_ZONE_MAP quadrant. Channel id -> quadrant is a fixed decision
    # (matches ROOM_ZONE_MAP's own declaration order), not derived from
    # anything -- 0=front-left, 1=front-right, 2=back-left, 3=back-right.
    # See room-4zone-zonemap.json for the matching Zone Mapping UVs.
    {"id": "conf-room-4zone", "name": "Room (4-zone)",
     "channels": {0: ["ent-3"], 1: ["ent-4"], 2: ["ent-5"], 3: ["ent-6"]}},
]


def config_response():
    # PairingRoutes' /api/hue/validate only checks "name" and "bridgeid".
    return {
        "name": BRIDGE_NAME,
        "bridgeid": BRIDGE_ID,
        "modelid": "BSB002",
        "apiversion": "1.122.0",
        "swversion": "1.122.294010334",
    }


def register_success(username, clientkey):
    # The bridge always answers with a one-element array.
    return [{"success": {"username": username, "clientkey": clientkey}}]


def register_link_button_not_pressed():
    return [{"error": {"type": 101, "address": "",
                       "description": "link button not pressed"}}]


def entertainment_configurations():
    data = []
    for conf in CONFIGS:
        channels = [
            {"channel_id": channel_id,
             "members": [{"service": {"rid": rid}} for rid in members]}
            for channel_id, members in sorted(conf["channels"].items())
        ]
        data.append({"id": conf["id"],
                     "metadata": {"name": conf["name"]},
                     "channels": channels})
    return {"data": data}


def resources():
    data = []
    for device in DEVICES:
        data.append({
            "type": "device",
            "metadata": {"name": device["name"]},
            "services": [
                {"rtype": "entertainment", "rid": device["entertainment_id"]},
                {"rtype": "light", "rid": device["light_id"]},
            ],
        })
    return {"data": data}


def entertainment_configuration_status(conf_id, status):
    name = next(c["name"] for c in CONFIGS if c["id"] == conf_id)
    return {"data": [{"id": conf_id, "status": status,
                      "metadata": {"name": name}}]}


def light_snapshot(device):
    return {"data": [{
        "id": device["light_id"],
        "metadata": {"name": device["name"]},
        "on": {"on": device["on"]},
        "dimming": {"brightness": device["brightness"]},
        "color": {"xy": dict(device["xy"])},
    }]}
