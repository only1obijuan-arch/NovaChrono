const connectionString = process.env.TEST_DATABASE_URL;

if (!connectionString) {
  throw new Error("TEST_DATABASE_URL is required for integration tests");
}

process.env.DATABASE_URL = connectionString;
process.env.DATABASE_DRIVER = "pg";
process.env.AUTH_SECRET = "novachrono-integration-only-secret-at-least-32-characters";
