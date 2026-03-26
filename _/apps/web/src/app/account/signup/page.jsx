"use client";
import { useState, useEffect } from "react";
import useAuth from "@/utils/useAuth";
import { ChevronLeft } from "lucide-react";

export default function AdminSignUp() {
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [venueId, setVenueId] = useState("");
  const [venues, setVenues] = useState([]);

  const { signUpWithCredentials } = useAuth();

  useEffect(() => {
    const fetchVenues = async () => {
      const res = await fetch("/api/venues");
      if (res.ok) {
        const data = await res.json();
        setVenues(data);
      }
    };
    fetchVenues();
  }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!email || !password || !name || !venueId) {
      setError("Please fill in all fields");
      setLoading(false);
      return;
    }

    try {
      // Store venue_id in localStorage to be set during onboarding
      localStorage.setItem("pendingVenueId", venueId);

      await signUpWithCredentials({
        email,
        password,
        name,
        callbackUrl: "/admin/onboarding",
        redirect: true,
      });
    } catch (err) {
      setError("Could not create account. Email may already be in use.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FC] py-12 px-6 font-inter">
      <div className="max-w-md mx-auto">
        <a
          href="/"
          className="inline-flex items-center text-[#667085] hover:text-[#111418] mb-8 font-semibold transition-colors"
        >
          <ChevronLeft size={20} className="mr-1" />
          Back to Home
        </a>

        <div className="bg-white rounded-3xl shadow-sm border border-[#ECECEC] overflow-hidden">
          <div className="p-10 border-b border-[#ECECEC] bg-[#FAFAFA]">
            <h1 className="text-3xl font-extrabold text-[#111418] mb-2">
              Admin Sign Up
            </h1>
            <p className="text-[#667085]">
              Create an account to manage your venue
            </p>
          </div>

          <form onSubmit={onSubmit} className="p-10 space-y-6">
            <div className="flex flex-col">
              <label className="text-sm font-bold text-[#111418] mb-2 uppercase tracking-wider">
                Full Name
              </label>
              <input
                required
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Doe"
                className="h-12 px-4 rounded-xl border border-[#DCDDDF] focus:border-[#FF2D22] focus:ring-1 focus:ring-[#FF2D22] outline-none transition-all"
              />
            </div>

            <div className="flex flex-col">
              <label className="text-sm font-bold text-[#111418] mb-2 uppercase tracking-wider">
                Email
              </label>
              <input
                required
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@venue.com"
                className="h-12 px-4 rounded-xl border border-[#DCDDDF] focus:border-[#FF2D22] focus:ring-1 focus:ring-[#FF2D22] outline-none transition-all"
              />
            </div>

            <div className="flex flex-col">
              <label className="text-sm font-bold text-[#111418] mb-2 uppercase tracking-wider">
                Password
              </label>
              <input
                required
                name="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 px-4 rounded-xl border border-[#DCDDDF] focus:border-[#FF2D22] focus:ring-1 focus:ring-[#FF2D22] outline-none transition-all"
                placeholder="Create a strong password"
              />
            </div>

            <div className="flex flex-col">
              <label className="text-sm font-bold text-[#111418] mb-2 uppercase tracking-wider">
                Venue
              </label>
              <select
                required
                value={venueId}
                onChange={(e) => setVenueId(e.target.value)}
                className="h-12 px-4 rounded-xl border border-[#DCDDDF] focus:border-[#FF2D22] outline-none transition-all"
              >
                <option value="">Select your venue</option>
                {venues.map((venue) => (
                  <option key={venue.id} value={venue.id}>
                    {venue.name}
                  </option>
                ))}
              </select>
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 font-semibold">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#111418] hover:bg-black text-white font-extrabold py-4 rounded-2xl shadow-xl transition-all transform hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
            >
              {loading ? "Creating Account..." : "Create Admin Account"}
            </button>

            <p className="text-center text-sm text-[#667085]">
              Already have an account?{" "}
              <a
                href="/account/signin"
                className="text-[#FF2D22] font-bold hover:underline"
              >
                Sign in
              </a>
            </p>
          </form>
        </div>
      </div>

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
        .font-inter { font-family: 'Inter', sans-serif; }
      `}</style>
    </div>
  );
}
