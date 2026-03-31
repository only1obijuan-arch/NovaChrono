export async function GET(request) {
  // Prevent debug info exposure in production
  if (process.env.NODE_ENV === "production") {
    return Response.json(
      { error: "Debug endpoint disabled in production" },
      { status: 403 },
    );
  }

  const headers = {};
  for (const [key, value] of request.headers.entries()) {
    headers[key] = value;
  }

  const debugInfo = {
    AUTH_URL: process.env.AUTH_URL || "NOT SET",
    AUTH_SECRET_EXISTS: !!process.env.AUTH_SECRET,
    requestUrl: request.url,
    requestMethod: request.method,
    origin: headers.origin || "NOT SET",
    host: headers.host || "NOT SET",
    referer: headers.referer || "NOT SET",
    "x-forwarded-proto": headers["x-forwarded-proto"] || "NOT SET",
    "x-forwarded-host": headers["x-forwarded-host"] || "NOT SET",
  };

  return Response.json(debugInfo, {
    headers: {
      "Content-Type": "application/json",
    },
  });
}
