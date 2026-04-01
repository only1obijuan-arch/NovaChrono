// Re-export the shared sql tagged-template function from the singleton db module.
// All API routes that import sql from this file now use the single shared Pool.
export { sql as default } from "@/app/api/utils/db";
