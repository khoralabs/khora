import type { Database } from "bun:sqlite";
import type { DomainEvent, DomainEventName } from "../events/index.ts";
import { zDomainEventName } from "../events/index.ts";
import type {
  CalendarHold,
  Invite,
  InviteePersonaSlug,
  Profile,
  Reflection,
  UserPublicProfileFields,
} from "../models/index.ts";
import { zBooking, zCalendarHold, zInvite, zProfile, zReflection } from "../models/index.ts";

function nowMs(): number {
  return Date.now();
}

function appendEventRow(
  db: Database,
  name: DomainEventName,
  subjectId: string,
  aggregateId: string,
  payload: Record<string, unknown> | undefined,
  occurredAt: number,
): void {
  const payloadJson = payload === undefined ? null : JSON.stringify(payload);
  db.run(
    "INSERT INTO domain_events (name, subject_id, aggregate_id, payload_json, occurred_at) VALUES (?, ?, ?, ?, ?)",
    [name, subjectId, aggregateId, payloadJson, occurredAt],
  );
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
  constructor(private readonly db: Database) {}

  getProfile(subjectId: string): Profile | null {
    const row = this.db
      .query("SELECT display_name, tagline, about, updated_at FROM profiles WHERE subject_id = ?")
      .get(subjectId) as
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
    this.db.run(
      `INSERT INTO profiles (subject_id, display_name, tagline, about, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(subject_id) DO UPDATE SET
         display_name = excluded.display_name,
         tagline = excluded.tagline,
         about = excluded.about,
         updated_at = excluded.updated_at`,
      [subjectId, fields.displayName, fields.tagline, fields.about, t],
    );
    const p = this.getProfile(subjectId);
    if (p === null) {
      throw new Error("internal: profile not found after upsert");
    }
    appendEventRow(
      this.db,
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
    this.db.run(
      `INSERT INTO invites (id, subject_id, invitee_persona_slug, message, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [args.id, args.subjectId, args.inviteePersonaSlug, args.message, status, t, t],
    );
    const inv = this.getInvite(args.id);
    if (inv === null) {
      throw new Error("internal: invite not found after insert");
    }
    appendEventRow(
      this.db,
      "InviteCreated",
      args.subjectId,
      args.id,
      { inviteePersonaSlug: args.inviteePersonaSlug },
      t,
    );
    return inv;
  }

  getInvite(id: string): Invite | null {
    const row = this.db
      .query(
        "SELECT id, subject_id, invitee_persona_slug, message, status, created_at, updated_at FROM invites WHERE id = ?",
      )
      .get(id) as
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

  updateInviteStatus(id: string, status: Invite["status"]): void {
    const t = nowMs();
    this.db.run("UPDATE invites SET status = ?, updated_at = ? WHERE id = ?", [status, t, id]);
  }

  setInviteFinished(id: string, result: unknown): void {
    const inv = this.getInvite(id);
    if (inv === null) {
      return;
    }
    const t = nowMs();
    const r = result as { status?: string };
    const status: Invite["status"] = r?.status === "error" ? "failed" : "finished";
    this.db.run("UPDATE invites SET status = ?, updated_at = ? WHERE id = ?", [status, t, id]);
    this.upsertBookingForInvite(id, result);
    appendEventRow(this.db, "InviteCompleted", inv.subjectId, id, { outcome: result }, t);
  }

  upsertBookingForInvite(
    inviteId: string,
    result: unknown,
  ): { id: string; inviteId: string; result: unknown; createdAt: number } {
    const t = nowMs();
    const id = inviteId;
    const resultJson = JSON.stringify(result);
    this.db.run(
      `INSERT INTO bookings (id, invite_id, result_json, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (invite_id) DO UPDATE SET
         result_json = excluded.result_json,
         id = excluded.id,
         created_at = excluded.created_at`,
      [id, inviteId, resultJson, t],
    );
    const booking = zBooking.parse({
      id,
      inviteId,
      result,
      createdAt: t,
    });
    const inv = this.getInvite(inviteId);
    if (inv !== null) {
      appendEventRow(
        this.db,
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
    this.db.run(
      `INSERT INTO calendar_holds (id, subject_id, invite_id, booking_id, start_at, end_at, time_zone, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
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
      ],
    );
    const h = this.db
      .query(
        "SELECT id, subject_id, invite_id, booking_id, start_at, end_at, time_zone, status, created_at, updated_at FROM calendar_holds WHERE id = ?",
      )
      .get(id) as {
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
    const rows = this.db
      .query(
        "SELECT id, subject_id, invite_id, booking_id, start_at, end_at, time_zone, status, created_at, updated_at FROM calendar_holds WHERE subject_id = ? ORDER BY start_at",
      )
      .all(subjectId) as {
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
    this.db.run(
      "INSERT INTO reflections (id, run_id, kind, decision, agent_feedback, text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        id,
        input.runId,
        input.kind,
        input.decision ?? null,
        input.agentFeedback ?? null,
        input.text ?? null,
        t,
      ],
    );
    const inv = this.getInvite(input.runId);
    const sub = inv?.subjectId ?? "unknown";
    appendEventRow(
      this.db,
      "ReflectionRecorded",
      sub,
      id,
      { kind: input.kind, runId: input.runId },
      t,
    );
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
    appendEventRow(
      this.db,
      event.name,
      event.subjectId,
      event.aggregateId,
      (event.payload as Record<string, unknown> | undefined) ?? undefined,
      event.occurredAt,
    );
  }

  listEventsForSubject(subjectId: string, limit: number): DomainEvent[] {
    const rows = this.db
      .query(
        "SELECT id, name, subject_id, aggregate_id, payload_json, occurred_at FROM domain_events WHERE subject_id = ? ORDER BY id DESC LIMIT ?",
      )
      .all(subjectId, limit) as {
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
