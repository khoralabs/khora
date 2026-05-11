import type { Database, Statement } from "bun:sqlite";
import type { DomainEvent, DomainEventName } from "../events/index.ts";
import { zDomainEventName } from "../events/index.ts";
import type {
  CalendarHold,
  CreateGoalInput,
  Goal,
  Invite,
  InviteePersonaSlug,
  Profile,
  Reflection,
  RunSummary,
  UpsertRunSummaryInput,
  UserPublicProfileFields,
} from "../models/index.ts";
import {
  zBooking,
  zCalendarHold,
  zGoal,
  zInvite,
  zProfile,
  zReflection,
  zRunSummary,
} from "../models/index.ts";

function nowMs(): number {
  return Date.now();
}

export type MatchmakingDomainPersistence = {
  getProfile(subjectId: string): Profile | null;
  upsertProfile(subjectId: string, fields: UserPublicProfileFields): Profile;

  createInvite(args: {
    id: string;
    subjectId: string;
    inviteePersonaSlug: InviteePersonaSlug;
    message: string;
  }): Invite;
  getInvite(id: string): Invite | null;
  listGoalsByInviteId(inviteId: string): Goal[];
  listRunSummariesByRunId(runId: string): RunSummary[];
  upsertRunSummary(input: UpsertRunSummaryInput): RunSummary;
  createGoals(args: { inviteId: string; subjectId: string; goals: CreateGoalInput[] }): Goal[];
  updateInviteStatus(id: string, status: Invite["status"]): void;
  setInviteFinished(id: string, result: unknown): void;

  upsertBookingForInvite(
    inviteId: string,
    result: unknown,
  ): { id: string; inviteId: string; result: unknown; createdAt: number };

  createCalendarHold(
    input: Omit<CalendarHold, "id" | "createdAt" | "updatedAt"> & { id?: string },
  ): CalendarHold;
  getCalendarHoldsBySubject(subjectId: string): CalendarHold[];

  recordReflection(input: Omit<Reflection, "id" | "createdAt"> & { id?: string }): Reflection;

  appendEvent(event: Omit<DomainEvent, "id"> & { name: DomainEventName }): void;
  listEventsForSubject(subjectId: string, limit: number): DomainEvent[];
};

export class SqliteMatchmakingDomainPersistence implements MatchmakingDomainPersistence {
  private readonly selectProfile: Statement;
  private readonly upsertProfileStmt: Statement;
  private readonly insertInvite: Statement;
  private readonly selectInvite: Statement;
  private readonly selectGoalsByInviteId: Statement;
  private readonly selectRunSummariesByRunId: Statement;
  private readonly upsertRunSummaryStmt: Statement;
  private readonly selectRunSummaryByRunAndParty: Statement;
  private readonly insertGoal: Statement;
  private readonly updateInviteStatusStmt: Statement;
  private readonly upsertBookingStmt: Statement;
  private readonly insertCalendarHold: Statement;
  private readonly selectCalendarHoldById: Statement;
  private readonly selectCalendarHoldsBySubject: Statement;
  private readonly insertReflection: Statement;
  private readonly insertEvent: Statement;
  private readonly selectEventsForSubject: Statement;

  constructor(private readonly db: Database) {
    this.selectProfile = db.prepare(
      "SELECT display_name, tagline, about, updated_at FROM profiles WHERE subject_id = ?",
    );
    this.upsertProfileStmt = db.prepare(
      `INSERT INTO profiles (subject_id, display_name, tagline, about, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(subject_id) DO UPDATE SET
         display_name = excluded.display_name,
         tagline = excluded.tagline,
         about = excluded.about,
         updated_at = excluded.updated_at`,
    );
    this.insertInvite = db.prepare(
      `INSERT INTO invites (id, subject_id, invitee_persona_slug, message, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    this.selectInvite = db.prepare(
      "SELECT id, subject_id, invitee_persona_slug, message, status, created_at, updated_at FROM invites WHERE id = ?",
    );
    this.selectGoalsByInviteId = db.prepare(
      "SELECT id, invite_id, subject_id, text, kind, priority, created_at FROM goals WHERE invite_id = ? ORDER BY COALESCE(priority, 2147483647), created_at, id",
    );
    this.selectRunSummariesByRunId = db.prepare(
      "SELECT id, run_id, party_slug, counterparty_slug, summary_text, fit_assessment, key_evidence_json, recommended_next_step, created_at, updated_at FROM run_summaries WHERE run_id = ? ORDER BY party_slug, id",
    );
    this.upsertRunSummaryStmt = db.prepare(
      `INSERT INTO run_summaries (
          id, run_id, party_slug, counterparty_slug, summary_text, fit_assessment, key_evidence_json, recommended_next_step, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(run_id, party_slug) DO UPDATE SET
         counterparty_slug = excluded.counterparty_slug,
         summary_text = excluded.summary_text,
         fit_assessment = excluded.fit_assessment,
         key_evidence_json = excluded.key_evidence_json,
         recommended_next_step = excluded.recommended_next_step,
         updated_at = excluded.updated_at`,
    );
    this.selectRunSummaryByRunAndParty = db.prepare(
      "SELECT id, run_id, party_slug, counterparty_slug, summary_text, fit_assessment, key_evidence_json, recommended_next_step, created_at, updated_at FROM run_summaries WHERE run_id = ? AND party_slug = ?",
    );
    this.insertGoal = db.prepare(
      "INSERT INTO goals (id, invite_id, subject_id, text, kind, priority, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    this.updateInviteStatusStmt = db.prepare(
      "UPDATE invites SET status = ?, updated_at = ? WHERE id = ?",
    );
    this.upsertBookingStmt = db.prepare(
      `INSERT INTO bookings (id, invite_id, result_json, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (invite_id) DO UPDATE SET
         result_json = excluded.result_json,
         id = excluded.id,
         created_at = excluded.created_at`,
    );
    this.insertCalendarHold = db.prepare(
      `INSERT INTO calendar_holds (id, subject_id, invite_id, booking_id, start_at, end_at, time_zone, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    this.selectCalendarHoldById = db.prepare(
      "SELECT id, subject_id, invite_id, booking_id, start_at, end_at, time_zone, status, created_at, updated_at FROM calendar_holds WHERE id = ?",
    );
    this.selectCalendarHoldsBySubject = db.prepare(
      "SELECT id, subject_id, invite_id, booking_id, start_at, end_at, time_zone, status, created_at, updated_at FROM calendar_holds WHERE subject_id = ? ORDER BY start_at",
    );
    this.insertReflection = db.prepare(
      "INSERT INTO reflections (id, run_id, kind, decision, agent_feedback, text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    this.insertEvent = db.prepare(
      "INSERT INTO domain_events (name, subject_id, aggregate_id, payload_json, occurred_at) VALUES (?, ?, ?, ?, ?)",
    );
    this.selectEventsForSubject = db.prepare(
      "SELECT id, name, subject_id, aggregate_id, payload_json, occurred_at FROM domain_events WHERE subject_id = ? ORDER BY id DESC LIMIT ?",
    );
  }

  private appendEventRow(
    name: DomainEventName,
    subjectId: string,
    aggregateId: string,
    payload: Record<string, unknown> | undefined,
    occurredAt: number,
  ): void {
    const payloadJson = payload === undefined ? null : JSON.stringify(payload);
    this.insertEvent.run(name, subjectId, aggregateId, payloadJson, occurredAt);
  }

  getProfile(subjectId: string): Profile | null {
    const row = this.selectProfile.get(subjectId) as
      | { display_name: string; tagline: string; about: string; updated_at: number }
      | undefined;
    if (row == null) {
      return null;
    }
    return zProfile.parse({
      subjectId,
      displayName: row.display_name,
      tagline: row.tagline,
      about: row.about,
      updatedAt: row.updated_at,
    });
  }

  upsertProfile(subjectId: string, fields: UserPublicProfileFields): Profile {
    const t = nowMs();
    this.upsertProfileStmt.run(subjectId, fields.displayName, fields.tagline, fields.about, t);
    const p = this.getProfile(subjectId);
    if (p === null) {
      throw new Error("internal: profile not found after upsert");
    }
    this.appendEventRow(
      "ProfileUpserted",
      subjectId,
      subjectId,
      { displayName: fields.displayName },
      t,
    );
    return p;
  }

  createInvite(args: {
    id: string;
    subjectId: string;
    inviteePersonaSlug: InviteePersonaSlug;
    message: string;
  }): Invite {
    const t = nowMs();
    const status = "pending" as const;
    this.insertInvite.run(
      args.id,
      args.subjectId,
      args.inviteePersonaSlug,
      args.message,
      status,
      t,
      t,
    );
    const inv = this.getInvite(args.id);
    if (inv === null) {
      throw new Error("internal: invite not found after insert");
    }
    this.appendEventRow(
      "InviteCreated",
      args.subjectId,
      args.id,
      { inviteePersonaSlug: args.inviteePersonaSlug },
      t,
    );
    return inv;
  }

  getInvite(id: string): Invite | null {
    const row = this.selectInvite.get(id) as
      | {
          id: string;
          subject_id: string;
          invitee_persona_slug: string;
          message: string;
          status: string;
          created_at: number;
          updated_at: number;
        }
      | undefined;
    if (row == null) {
      return null;
    }
    return zInvite.parse({
      id: row.id,
      subjectId: row.subject_id,
      inviteePersonaSlug: row.invitee_persona_slug,
      message: row.message,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }

  listGoalsByInviteId(inviteId: string): Goal[] {
    const rows = this.selectGoalsByInviteId.all(inviteId) as {
      id: string;
      invite_id: string;
      subject_id: string;
      text: string;
      kind: string | null;
      priority: number | null;
      created_at: number;
    }[];
    return rows.map((r) =>
      zGoal.parse({
        id: r.id,
        inviteId: r.invite_id,
        subjectId: r.subject_id,
        text: r.text,
        ...(r.kind !== null ? { kind: r.kind } : {}),
        ...(r.priority !== null ? { priority: r.priority } : {}),
        createdAt: r.created_at,
      }),
    );
  }

  listRunSummariesByRunId(runId: string): RunSummary[] {
    const rows = this.selectRunSummariesByRunId.all(runId) as {
      id: string;
      run_id: string;
      party_slug: string;
      counterparty_slug: string;
      summary_text: string;
      fit_assessment: string | null;
      key_evidence_json: string;
      recommended_next_step: string | null;
      created_at: number;
      updated_at: number;
    }[];
    return rows.map((r) =>
      zRunSummary.parse({
        id: r.id,
        runId: r.run_id,
        partySlug: r.party_slug,
        counterpartySlug: r.counterparty_slug,
        summaryText: r.summary_text,
        ...(r.fit_assessment !== null ? { fitAssessment: r.fit_assessment } : {}),
        keyEvidence: JSON.parse(r.key_evidence_json) as string[],
        ...(r.recommended_next_step !== null
          ? { recommendedNextStep: r.recommended_next_step }
          : {}),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }),
    );
  }

  upsertRunSummary(input: UpsertRunSummaryInput): RunSummary {
    const t = nowMs();
    const id = crypto.randomUUID();
    this.upsertRunSummaryStmt.run(
      id,
      input.runId,
      input.partySlug,
      input.counterpartySlug,
      input.summaryText,
      input.fitAssessment ?? null,
      JSON.stringify(input.keyEvidence ?? []),
      input.recommendedNextStep ?? null,
      t,
      t,
    );
    const row = this.selectRunSummaryByRunAndParty.get(input.runId, input.partySlug) as
      | {
          id: string;
          run_id: string;
          party_slug: string;
          counterparty_slug: string;
          summary_text: string;
          fit_assessment: string | null;
          key_evidence_json: string;
          recommended_next_step: string | null;
          created_at: number;
          updated_at: number;
        }
      | undefined;
    if (row === undefined) {
      throw new Error("internal: run summary not found after upsert");
    }
    const summary = zRunSummary.parse({
      id: row.id,
      runId: row.run_id,
      partySlug: row.party_slug,
      counterpartySlug: row.counterparty_slug,
      summaryText: row.summary_text,
      ...(row.fit_assessment !== null ? { fitAssessment: row.fit_assessment } : {}),
      keyEvidence: JSON.parse(row.key_evidence_json) as string[],
      ...(row.recommended_next_step !== null
        ? { recommendedNextStep: row.recommended_next_step }
        : {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
    const invite = this.getInvite(input.runId);
    if (invite !== null) {
      this.appendEventRow(
        "RunSummaryGenerated",
        invite.subjectId,
        input.runId,
        { partySlug: input.partySlug },
        t,
      );
    }
    return summary;
  }

  createGoals(args: { inviteId: string; subjectId: string; goals: CreateGoalInput[] }): Goal[] {
    const t = nowMs();
    const rows: Goal[] = [];
    args.goals.forEach((goal, idx) => {
      const id = crypto.randomUUID();
      this.insertGoal.run(
        id,
        args.inviteId,
        args.subjectId,
        goal.text,
        goal.kind ?? null,
        goal.priority ?? idx,
        t,
      );
      rows.push(
        zGoal.parse({
          id,
          inviteId: args.inviteId,
          subjectId: args.subjectId,
          text: goal.text,
          ...(goal.kind !== undefined ? { kind: goal.kind } : {}),
          ...(goal.priority !== undefined ? { priority: goal.priority } : { priority: idx }),
          createdAt: t,
        }),
      );
    });
    this.appendEventRow(
      "GoalsExtracted",
      args.subjectId,
      args.inviteId,
      { count: rows.length },
      t,
    );
    return rows;
  }

  updateInviteStatus(id: string, status: Invite["status"]): void {
    const t = nowMs();
    this.updateInviteStatusStmt.run(status, t, id);
  }

  setInviteFinished(id: string, result: unknown): void {
    const inv = this.getInvite(id);
    if (inv === null) {
      return;
    }
    const t = nowMs();
    const r = result as { status?: string };
    const status: Invite["status"] = r?.status === "error" ? "failed" : "finished";
    this.updateInviteStatusStmt.run(status, t, id);
    this.upsertBookingForInvite(id, result);
    this.appendEventRow("InviteCompleted", inv.subjectId, id, { outcome: result }, t);
  }

  upsertBookingForInvite(
    inviteId: string,
    result: unknown,
  ): { id: string; inviteId: string; result: unknown; createdAt: number } {
    const t = nowMs();
    const id = inviteId;
    const resultJson = JSON.stringify(result);
    this.upsertBookingStmt.run(id, inviteId, resultJson, t);
    const booking = zBooking.parse({
      id,
      inviteId,
      result,
      createdAt: t,
    });
    const inv = this.getInvite(inviteId);
    if (inv !== null) {
      this.appendEventRow(
        "BookingRecorded",
        inv.subjectId,
        booking.id,
        { inviteId, result: result as object | null },
        t,
      );
    }
    return { id, inviteId, result, createdAt: t };
  }

  createCalendarHold(
    input: Omit<CalendarHold, "id" | "createdAt" | "updatedAt"> & { id?: string },
  ): CalendarHold {
    const id = input.id ?? crypto.randomUUID();
    const t = nowMs();
    this.insertCalendarHold.run(
      id,
      input.subjectId,
      input.inviteId,
      input.bookingId,
      input.startAt,
      input.endAt,
      input.timeZone,
      input.status,
      t,
      t,
    );
    const h = this.selectCalendarHoldById.get(id) as {
      id: string;
      subject_id: string;
      invite_id: string | null;
      booking_id: string | null;
      start_at: number;
      end_at: number;
      time_zone: string;
      status: string;
      created_at: number;
      updated_at: number;
    } | null;
    if (h == null) {
      throw new Error("internal: calendar hold not found after insert");
    }
    return zCalendarHold.parse({
      id: h.id,
      subjectId: h.subject_id,
      inviteId: h.invite_id,
      bookingId: h.booking_id,
      startAt: h.start_at,
      endAt: h.end_at,
      timeZone: h.time_zone,
      status: h.status,
      createdAt: h.created_at,
      updatedAt: h.updated_at,
    });
  }

  getCalendarHoldsBySubject(subjectId: string): CalendarHold[] {
    const rows = this.selectCalendarHoldsBySubject.all(subjectId) as {
      id: string;
      subject_id: string;
      invite_id: string | null;
      booking_id: string | null;
      start_at: number;
      end_at: number;
      time_zone: string;
      status: string;
      created_at: number;
      updated_at: number;
    }[];
    return rows.map((h) =>
      zCalendarHold.parse({
        id: h.id,
        subjectId: h.subject_id,
        inviteId: h.invite_id,
        bookingId: h.booking_id,
        startAt: h.start_at,
        endAt: h.end_at,
        timeZone: h.time_zone,
        status: h.status,
        createdAt: h.created_at,
        updatedAt: h.updated_at,
      }),
    );
  }

  recordReflection(input: Omit<Reflection, "id" | "createdAt"> & { id?: string }): Reflection {
    const id = input.id ?? crypto.randomUUID();
    const t = nowMs();
    this.insertReflection.run(
      id,
      input.runId,
      input.kind,
      input.decision ?? null,
      input.agentFeedback ?? null,
      input.text ?? null,
      t,
    );
    const inv = this.getInvite(input.runId);
    const sub = inv?.subjectId ?? "unknown";
    this.appendEventRow("ReflectionRecorded", sub, id, { kind: input.kind, runId: input.runId }, t);
    return zReflection.parse({
      id,
      runId: input.runId,
      kind: input.kind,
      decision: input.decision,
      agentFeedback: input.agentFeedback,
      text: input.text,
      createdAt: t,
    });
  }

  appendEvent(event: Omit<DomainEvent, "id"> & { name: DomainEventName }): void {
    zDomainEventName.parse(event.name);
    this.appendEventRow(
      event.name,
      event.subjectId,
      event.aggregateId,
      (event.payload as Record<string, unknown> | undefined) ?? undefined,
      event.occurredAt,
    );
  }

  listEventsForSubject(subjectId: string, limit: number): DomainEvent[] {
    const rows = this.selectEventsForSubject.all(subjectId, limit) as {
      id: number;
      name: string;
      subject_id: string;
      aggregate_id: string;
      payload_json: string | null;
      occurred_at: number;
    }[];
    return rows.map((r) => ({
      id: String(r.id),
      name: r.name as DomainEventName,
      subjectId: r.subject_id,
      aggregateId: r.aggregate_id,
      payload: r.payload_json ? (JSON.parse(r.payload_json) as Record<string, unknown>) : undefined,
      occurredAt: r.occurred_at,
    }));
  }
}
