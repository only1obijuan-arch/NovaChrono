"use client";
import { useState } from "react";

export default function UpdatePasswordUtility() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const updatePassword = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/update-admin-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "juanpaulvdmerwe@gmail.com",
          password: "TestAdmin123!",
        }),
      });
      const data = await response.json();
      setResult(data);
    } catch (error) {
      setResult({ error: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
        <h1 className="text-2xl font-bold mb-4">Update Admin Password</h1>
        <p className="text-gray-600 mb-4">
          This will update the password for juanpaulvdmerwe@gmail.com to:{" "}
          <code className="bg-gray-100 px-2 py-1 rounded">TestAdmin123!</code>
        </p>

        <button
          onClick={updatePassword}
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 disabled:bg-gray-400"
        >
          {loading ? "Updating..." : "Update Password"}
        </button>

        {result && (
          <div
            className={`mt-4 p-4 rounded ${result.success ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}
          >
            <pre className="text-sm overflow-auto">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
