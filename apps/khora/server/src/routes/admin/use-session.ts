import { useEffect, useState } from "react";

export function useAdminSession(): boolean | null {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/admin/api/session");
        setAuthenticated(res.ok);
        if (!res.ok) {
          window.location.href = "/admin/login";
        }
      } catch {
        setAuthenticated(false);
        window.location.href = "/admin/login";
      }
    })();
  }, []);

  return authenticated;
}
