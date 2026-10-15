import json
from urllib.request import urlopen

url = "https://api.open-meteo.com/v1/forecast?latitude=40.71&longitude=-74.01&hourly=cloud_cover&timezone=auto&forecast_days=2"

with urlopen(url) as response:
    data = json.loads(response.read().decode())

print(data["hourly"]["cloud_cover"][:5])