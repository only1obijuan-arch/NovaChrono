"use client";
import { useState } from "react";

export default function ResetAllPasswordsPage() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    if (!confirm("Reset ALL passwords to TempPassword123! ?")) return;

    setLoading(true);
    try {
      const response = await fetch("/api/reset-all-passwords", {
        method: "POST",
      });
      const data = await response.json();
      setResult(data);
    } catch (error) {
      setResult({ success: false, error: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          Reset All Passwords
        </h1>
        <p className="text-gray-600 mb-6">
          This will reset ALL user passwords to{" "}
          <code className="bg-gray-100 px-2 py-1 rounded text-sm">
            TempPassword123!
          </code>
        </p>

        <button
          onClick={handleReset}
          disabled={loading}
          className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white font-semibold py-3 px-4 rounded-lg transition"
        >
          {loading ? "Resetting..." : "Reset All Passwords"}
        </button>

        {result && (
          <div
            className={`mt-6 p-4 rounded-lg ${result.success ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}
          >
            <p
              className={`font-semibold ${result.success ? "text-green-800" : "text-red-800"}`}
            >
              {result.success ? "✓ Success!" : "✗ Error"}
            </p>
            <p
              className={`text-sm mt-1 ${result.success ? "text-green-700" : "text-red-700"}`}
            >
              {result.message || result.error}
            </p>
            {result.updatedCount && (
              <p className="text-sm text-green-600 mt-2">
                Updated {result.updatedCount} accounts
              </p>
            )}
          </div>
        )}

        {result?.success && (
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm font-semibold text-blue-900 mb-2">
              All accounts now use:
            </p>
            <p className="text-sm text-blue-800">
              Password:{" "}
              <code className="bg-white px-2 py-1 rounded">
                TempPassword123!
              </code>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
