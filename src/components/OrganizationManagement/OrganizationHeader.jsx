import { Building2 } from "lucide-react";

export function OrganizationHeader({ organizationName }) {
  return (
    <div className="om-header">
      <div className="om-header-row">
        <Building2 size={28} className="om-header-icon" />
        <h1 className="om-title">{organizationName || "LOADING..."}</h1>
      </div>
      <p className="om-subtitle">MANAGE VENUES & ADMINISTRATORS</p>
    </div>
  );
}
