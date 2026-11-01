// Weather via Open-Meteo (free, no API key) + BigDataCloud reverse geocoding
// (free, no API key) for the place name. Both are public, CORS-friendly APIs,
// so no server-side proxy or VITE_ env var is needed like the vision/replicate
// integrations require.

const WMO_DESCRIPTIONS: Record<number, string> = {
  0: "clear sky",
  1: "mainly clear",
  2: "partly cloudy",
  3: "overcast",
  45: "foggy",
  48: "foggy with rime",
  51: "light drizzle",
  53: "moderate drizzle",
  55: "dense drizzle",
  61: "light rain",
  63: "moderate rain",
  65: "heavy rain",
  71: "light snow",
  73: "moderate snow",
  75: "heavy snow",
  77: "snow grains",
  80: "light rain showers",
  81: "moderate rain showers",
  82: "violent rain showers",
  85: "light snow showers",
  86: "heavy snow showers",
  95: "thunderstorm",
  96: "thunderstorm with light hail",
  99: "thunderstorm with heavy hail",
};

function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported by this browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      timeout: 10_000,
      maximumAge: 5 * 60 * 1000, // reuse a fix up to 5 min old
    });
  });
}

export async function getCurrentWeather(): Promise<string> {
  const position = await getCurrentPosition();
  const { latitude, longitude } = position.coords;

  const [weatherRes, placeRes] = await Promise.all([
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
        `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code`,
    ),
    fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`,
    ).catch(() => null),
  ]);

  if (!weatherRes.ok) {
    throw new Error(`Weather API returned ${weatherRes.status}`);
  }

  const weather = await weatherRes.json();
  const current = weather.current;
  const description = WMO_DESCRIPTIONS[current.weather_code] ?? "unknown conditions";

  let place = "";
  if (placeRes && placeRes.ok) {
    const geo = await placeRes.json();
    place = geo.city || geo.locality || geo.principalSubdivision || "";
  }
  const placeSuffix = place ? ` in ${place}` : "";

  return (
    `It's currently ${Math.round(current.temperature_2m)}°C and ${description}${placeSuffix}, ` +
    `with ${Math.round(current.relative_humidity_2m)}% humidity and wind at ${Math.round(current.wind_speed_10m)} km/h.`
  );
}
