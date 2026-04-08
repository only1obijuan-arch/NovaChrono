import { auth } from "@/auth";

export async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const lat = searchParams.get("lat") || "-26.1076";
    const lon = searchParams.get("lon") || "28.0567";

    const apiKey = process.env.OPENWEATHER_API_KEY;
    const url = `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lon}&appid=${apiKey}&exclude=minutely,hourly,daily,alerts`;

    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to fetch weather data");

    const data = await res.json();
    const current = data.current;
    const weather = current.weather[0];

    const conditionCode = weather.id;
    const isThunderstorm = conditionCode >= 200 && conditionCode <= 299;
    const isSevere = isThunderstorm && current.wind_speed > 10;

    return Response.json({
      temp: Math.round(current.temp - 273.15),
      condition: weather.main,
      description: weather.description,
      wind_speed: current.wind_speed,
      humidity: current.humidity,
      icon: weather.icon,
      lightning_risk: isThunderstorm,
      severe: isSevere,
      condition_code: conditionCode,
    });
  } catch (error) {
    console.error("Weather API error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
