import type { ReactNode } from "react";
import { InviteRunProvider } from "@/components/phases/book/invite-run-context";
import { PersonaDirectoryProvider } from "@/components/phases/list/persona-directory-context";
import { MatchmakingNavigationProvider } from "@/components/phases/navigation/matchmaking-navigation-context";
import { PostMeetingReflectProvider } from "@/components/phases/post-meeting-reflect/post-meeting-reflect-context";
import { ProfileProvider } from "@/components/phases/profile/profile-context";

export function MatchmakingAppProviders({ children }: { children: ReactNode }) {
  return (
    <PersonaDirectoryProvider>
      <MatchmakingNavigationProvider>
        <InviteRunProvider>
          <PostMeetingReflectProvider>
            <ProfileProvider>{children}</ProfileProvider>
          </PostMeetingReflectProvider>
        </InviteRunProvider>
      </MatchmakingNavigationProvider>
    </PersonaDirectoryProvider>
  );
}
