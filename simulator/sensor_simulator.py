"""
ColdChain Guard — IoT Sensor Simulator
Simulates 3 cold storage rooms and sends realistic sensor data to the backend.
"""

import requests
import random
import time
import math

BASE_URL = "https://coldchain-guard-backend.onrender.com"

# Room configurations — each has different base values
ROOMS = {
    "Room-A": {
        "name": "Fruits Storage",
        "emoji": "🍎",
        "base_temp": 4.0,
        "base_humidity": 88.0,
        "base_co2": 600,
    },
    "Room-B": {
        "name": "Vegetables Storage",
        "emoji": "🥦",
        "base_temp": 3.0,
        "base_humidity": 92.0,
        "base_co2": 700,
    },
    "Room-C": {
        "name": "Dairy Storage",
        "emoji": "🧀",
        "base_temp": 2.0,
        "base_humidity": 85.0,
        "base_co2": 500,
    },
}


class SensorSimulator:
    def __init__(self):
        self.time_step = 0
        # Track how many more anomaly steps each room has
        self.anomaly_steps = {room: 0 for room in ROOMS}

    def add_noise(self, value, std=0.2):
        """Add Gaussian noise to a reading."""
        return value + random.gauss(0, std)

    def maybe_trigger_anomaly(self, room_id):
        """5% chance to trigger an anomaly lasting 3–8 readings."""
        if self.anomaly_steps[room_id] > 0:
            self.anomaly_steps[room_id] -= 1
            return True
        if random.random() < 0.05:
            self.anomaly_steps[room_id] = random.randint(3, 8)
            print(f"  ⚠️  Anomaly triggered in {room_id}!")
            return True
        return False

    def generate_reading(self, room_id):
        room = ROOMS[room_id]
        is_anomaly = self.maybe_trigger_anomaly(room_id)

        # Gentle natural variation over time (simulates compressor cycles)
        natural_variation = math.sin(self.time_step * 0.08) * 0.4

        if is_anomaly:
            # Simulate a fault — temperature spike, high humidity, CO2 buildup
            temp = room["base_temp"] + random.uniform(4, 8)
            humidity = room["base_humidity"] + random.uniform(5, 15)
            co2 = room["base_co2"] + random.uniform(350, 700)
            door_open = random.random() < 0.45
        else:
            temp = self.add_noise(room["base_temp"] + natural_variation, 0.15)
            humidity = self.add_noise(room["base_humidity"], 0.8)
            co2 = self.add_noise(room["base_co2"], 18)
            door_open = random.random() < 0.02  # 2% chance door is briefly open

        return {
            "roomId": room_id,
            "temperature": round(temp, 2),
            "humidity": round(max(0, min(100, humidity)), 2),
            "co2": round(max(300, co2), 1),
            "doorOpen": door_open,
        }

    def send_reading(self, data):
        try:
            response = requests.post(
                f"{BASE_URL}/api/sensor-data",
                json=data,
                timeout=3
            )
            return response.json()
        except requests.exceptions.ConnectionError:
            print("  ❌ Cannot reach backend. Is server.js running?")
            return None
        except Exception as e:
            print(f"  ❌ Error: {e}")
            return None

    def risk_emoji(self, risk):
        if risk < 30:
            return "🟢"
        elif risk < 60:
            return "🟡"
        return "🔴"

    def run(self, interval=3):
        print("=" * 55)
        print("  🧊 ColdChain Guard — Sensor Simulator")
        print(f"  Sending to: {BASE_URL}")
        print(f"  Interval:   {interval}s per cycle")
        print("=" * 55)
        print()

        while True:
            print(f"⏱  Cycle {self.time_step + 1}")
            for room_id, room in ROOMS.items():
                data = self.generate_reading(room_id)
                result = self.send_reading(data)

                if result:
                    risk = result.get("spoilageRisk", 0)
                    door_str = " 🚪DOOR OPEN" if data["doorOpen"] else ""
                    print(
                        f"  {room['emoji']} {room_id}: "
                        f"Temp={data['temperature']:5.1f}°C | "
                        f"Hum={data['humidity']:5.1f}% | "
                        f"CO2={data['co2']:6.0f}ppm | "
                        f"Risk={risk:5.1f}% {self.risk_emoji(risk)}"
                        f"{door_str}"
                    )

            self.time_step += 1
            print()
            time.sleep(interval)


if __name__ == "__main__":
    sim = SensorSimulator()
    sim.run(interval=3)
