import json
from urllib.request import urlopen

url = "https://api.open-meteo.com/v1/forecast?latitude=40.71&longitude=-74.01&hourly=cloud_cover&timezone=auto&forecast_days=2"

with urlopen(url) as response:
    data = json.loads(response.read().decode())

print(data["hourly"]["cloud_cover"][:5])

times = data["hourly"]["time"][:5]
clouds = data["hourly"]["cloud_cover"][:5]
for time, cloud in zip(times, clouds):
    print(f"{time} → {cloud}% cloud")

clouds = data["hourly"]["cloud_cover"]
print(clouds)

tonight = clouds[20:28]
print(tonight)

average = sum(tonight) / len(tonight)
print(average)

if average < 25:
    verdict = "Clear"
elif average <60:
    verdict = "Partly Cloudy"
else:
    verdict = "Cloudy"

print(f"Tonight (8 PM - 4 AM): {average}% cloud on average → {verdict}")