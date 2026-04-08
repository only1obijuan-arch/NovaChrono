import { useState } from "react";

export function AddVenueModal({ onClose, onSubmit, isPending }) {
  const [venueName, setVenueName] = useState("");
  const [venueLocation, setVenueLocation] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (venueName.trim()) {
      onSubmit({ name: venueName.trim(), location: venueLocation.trim() || null, lat: lat || null, lng: lng || null });
      setVenueName("");
      setVenueLocation("");
      setLat("");
      setLng("");
    }
  };

  const handleClose = () => {
    setVenueName("");
    setVenueLocation("");
    setLat("");
    setLng("");
    onClose();
  };

  return (
    <div className="om-modal-overlay">
      <div className="om-modal">
        <h2 className="om-modal-title">// ADD VENUE</h2>
        <form onSubmit={handleSubmit}>
          <label className="om-modal-label">VENUE NAME</label>
          <input
            type="text"
            className="om-modal-input"
            placeholder="e.g. Coalition FC – Pretoria"
            value={venueName}
            onChange={(e) => setVenueName(e.target.value)}
            autoFocus
          />
          <label className="om-modal-label">LOCATION (OPTIONAL)</label>
          <input
            type="text"
            className="om-modal-input"
            placeholder="e.g. Pretoria, Gauteng"
            value={venueLocation}
            onChange={(e) => setVenueLocation(e.target.value)}
          />
          <label className="om-modal-label">LATITUDE (OPTIONAL)</label>
          <input
            type="number"
            step="any"
            className="om-modal-input"
            placeholder="e.g. -26.1076"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
          />
          <label className="om-modal-label">LONGITUDE (OPTIONAL)</label>
          <input
            type="number"
            step="any"
            className="om-modal-input"
            placeholder="e.g. 28.0567"
            value={lng}
            onChange={(e) => setLng(e.target.value)}
          />
          <div className="om-modal-btns">
            <button type="button" className="om-modal-cancel" onClick={handleClose}>
              CANCEL
            </button>
            <button
              type="submit"
              className="om-modal-submit"
              disabled={!venueName.trim() || isPending}
            >
              {isPending ? "CREATING..." : "CREATE VENUE"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
