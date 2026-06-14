import { requireRegistrySessionResponse } from "../auth/require-session";
import { getDb } from "../db/index";
import {
  getOrg,
  getTeam,
  listTeamsForUser,
  rollbackOnboarding,
  userHasAnyTeam,
} from "../db/membership";
import { createOrg, createTeam } from "../db/sessions";
import { getOrCreateUser } from "../identity/users";
import { bootstrapOrgTeamMemories } from "../memories/bootstrap";

export async function handleGetMe(req: Request): Promise<Response> {
  const auth = await requireRegistrySessionResponse(req);
  if (auth.response !== null) return auth.response;

  const db = getDb();
  const user = await getOrCreateUser(db, auth.session.user.id);
  const teams = listTeamsForUser(db, user.id);

  return Response.json({
    user: { id: user.id, registryUserId: user.registryUserId },
    teams,
    onboardingRequired: !userHasAnyTeam(db, user.id),
  });
}

type OnboardingBody = {
  orgName?: string;
  teamName?: string;
};

export async function handlePostOnboarding(req: Request): Promise<Response> {
  const auth = await requireRegistrySessionResponse(req);
  if (auth.response !== null) return auth.response;

  let body: OnboardingBody;
  try {
    body = (await req.json()) as OnboardingBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const orgName = body.orgName?.trim() ?? "";
  const teamName = body.teamName?.trim() ?? "";
  if (orgName.length === 0 || teamName.length === 0) {
    return Response.json({ error: "orgName and teamName are required" }, { status: 400 });
  }

  const db = getDb();
  const user = await getOrCreateUser(db, auth.session.user.id);

  if (userHasAnyTeam(db, user.id)) {
    return Response.json({ error: "User already belongs to a team" }, { status: 409 });
  }

  const orgId = createOrg(db, { name: orgName, ownerId: user.id });
  const teamId = createTeam(db, { orgId, name: teamName, ownerId: user.id });

  let memories: { orgDbPath: string; userDbPath: string };
  try {
    memories = bootstrapOrgTeamMemories({ orgId, teamId, userId: user.id });
  } catch (err) {
    rollbackOnboarding(db, { orgId, teamId });
    const message = err instanceof Error ? err.message : "Failed to bootstrap memories";
    console.error("[exedra] onboarding memories bootstrap failed:", message);
    return Response.json({ error: "Could not set up team memories. Try again." }, { status: 500 });
  }

  const org = getOrg(db, orgId);
  const team = getTeam(db, teamId);
  if (org === null || team === null) {
    return Response.json({ error: "Failed to create org or team" }, { status: 500 });
  }

  return Response.json(
    {
      org: { id: org.id, name: org.name },
      team: { id: team.id, name: team.name, orgId: team.orgId },
      memories,
    },
    { status: 201 },
  );
}
