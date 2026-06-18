import { useEffect } from "react";

import { InviteGate } from "@/components/auth/invite-gate";

import { AppChrome } from "../shell/app-chrome";
import { MainContent } from "../shell/main-content";

import "../styles/index.css";

function parseInviteToken(pathname: string): string | null {
  const match = /^\/invite\/([^/]+)\/?$/.exec(pathname);
  return match?.[1] ?? null;
}

function redirectBareSessionPath(): void {
  const sessionMatch = /^\/sessions\/([^/]+)\/?$/.exec(window.location.pathname);
  if (sessionMatch?.[1] !== undefined && sessionMatch[1] !== "new") {
    window.location.replace(`/sessions/${sessionMatch[1]}/interview`);
  }
}

export function App() {
  const pathname = window.location.pathname;
  const inviteToken = parseInviteToken(pathname);

  useEffect(() => {
    redirectBareSessionPath();
  }, []);

  if (inviteToken !== null) {
    return (
      <div className="min-h-screen p-6">
        <div className="flex min-h-[calc(100vh-3rem)] items-center justify-center">
          <InviteGate token={inviteToken} />
        </div>
      </div>
    );
  }

  return <AppChrome entrypoint="main">{(ctx) => <MainContent {...ctx} />}</AppChrome>;
}

export default App;
