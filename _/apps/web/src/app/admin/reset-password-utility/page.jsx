"use client";

import { useState } from "react";

export default function ResetPasswordUtility() {
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  const resetPassword = async () => {
    setStatus("loading");
    setMessage("Resetting password...");

    try {
      const response = await fetch("/api/reset-admin-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "only1obijuan@gmail.com",
          newPassword: "Admin123!",
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setStatus("success");
        setMessage(data.message || "Password reset successfully!");
      } else {
        setStatus("error");
        setMessage(data.error || "Failed to reset password");
      }
    } catch (error) {
      setStatus("error");
      setMessage(`Error: ${error.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          Password Reset Utility
        </h1>

        <div className="mb-6">
          <p className="text-sm text-gray-600 mb-2">
            <strong>Email:</strong> only1obijuan@gmail.com
          </p>
          <p className="text-sm text-gray-600">
            <strong>New Password:</strong> Admin123!
          </p>
        </div>

        <button
          onClick={resetPassword}
          disabled={status === "loading"}
          className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {status === "loading" ? "Resetting..." : "Reset Password Now"}
        </button>

        {message && (
          <div
            className={`mt-4 p-4 rounded-lg ${
              status === "success"
                ? "bg-green-50 text-green-800"
                : status === "error"
                  ? "bg-red-50 text-red-800"
                  : "bg-blue-50 text-blue-800"
            }`}
          >
            <p className="text-sm font-medium">{message}</p>
          </div>
        )}

        {status === "success" && (
          <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800">
              ⚠️ For security reasons, you should delete this utility page after
              use.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
