import { type FormEvent, useState } from "react";
import { Button } from "../../components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card.tsx";
import { renderRoute } from "../../render-route.tsx";
import "../../styles/globals.css";

function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const token = new FormData(e.currentTarget).get("token");
    if (typeof token !== "string" || token.trim().length === 0) return;

    setPending(true);
    setError(null);
    try {
      const res = await fetch("/admin/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
      });
      if (!res.ok) {
        setError("Invalid token");
        return;
      }
      window.location.href = "/admin";
    } catch {
      setError("Login failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md items-center p-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Registry Admin</CardTitle>
          <CardDescription>Enter the console root token configured on this service.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <label className="block space-y-2 text-sm">
              <span className="font-medium">Root token</span>
              <input
                name="token"
                type="password"
                autoComplete="off"
                className="w-full rounded-md border bg-background px-3 py-2 font-mono text-sm"
                disabled={pending}
              />
            </label>
            {error !== null && <p className="text-sm text-destructive">{error}</p>}
            <Button
              type="submit"
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={pending}
            >
              {pending ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

renderRoute(LoginPage);
