import { useQuery } from "@tanstack/react-query";

export function useUsersData(orgId) {
  const { data: usersData } = useQuery({
    queryKey: ["super-admin-users", orgId],
    queryFn: async () => {
      const res = await fetch(`/api/super-admin/users?organizationId=${orgId}`);
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json();
    },
    enabled: !!orgId,
  });

  return { usersData };
}
