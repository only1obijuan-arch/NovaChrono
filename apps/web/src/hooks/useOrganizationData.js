import { useQuery } from "@tanstack/react-query";

export function useOrganizationData(orgId) {
  const { data: orgsData } = useQuery({
    queryKey: ["super-admin-organizations"],
    queryFn: async () => {
      const res = await fetch("/api/super-admin/organizations");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const organization = orgsData?.organizations?.find((org) => org.id === orgId);

  return { organization, orgsData };
}
