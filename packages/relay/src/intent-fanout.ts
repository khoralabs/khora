import type { ServerWebSocket } from "bun";
import type { RelayWsData } from "./relay-ws-data.ts";

export type IntentMessage = {
  type: "intent";
  actorHex: string;
  topic: string;
  text: string;
  relayEndpoint: string;
  issuedAt: number;
};

export type InviteResponse = {
  type: "invite_response";
  intentActorHex: string;
  inviteToken: string;
};

export type IntentFanout = {
  /** Register subscriber topics + actor hex for invite routing. */
  attachSubscriber(ws: ServerWebSocket<RelayWsData>, topics: string[], actorHex: string): void;
  detachSubscriber(ws: ServerWebSocket<RelayWsData>): void;
  publishIntent(intent: IntentMessage): void;
  routeInviteResponse(response: InviteResponse): void;
};

export function createIntentFanout(): IntentFanout {
  const topicToSockets = new Map<string, Set<ServerWebSocket<RelayWsData>>>();
  const actorToSockets = new Map<string, Set<ServerWebSocket<RelayWsData>>>();
  const socketTopics = new Map<ServerWebSocket<RelayWsData>, Set<string>>();
  const socketActor = new Map<ServerWebSocket<RelayWsData>, string>();

  const addToTopic = (topic: string, ws: ServerWebSocket<RelayWsData>): void => {
    let set = topicToSockets.get(topic);
    if (set === undefined) {
      set = new Set();
      topicToSockets.set(topic, set);
    }
    set.add(ws);
  };

  const removeFromTopic = (topic: string, ws: ServerWebSocket<RelayWsData>): void => {
    const set = topicToSockets.get(topic);
    if (set === undefined) {
      return;
    }
    set.delete(ws);
    if (set.size === 0) {
      topicToSockets.delete(topic);
    }
  };

  return {
    attachSubscriber(ws, topics, actorHex) {
      this.detachSubscriber(ws);
      const tset = new Set<string>();
      for (const t of topics) {
        const trimmed = t.trim();
        if (trimmed.length === 0) {
          continue;
        }
        tset.add(trimmed);
        addToTopic(trimmed, ws);
      }
      socketTopics.set(ws, tset);
      socketActor.set(ws, actorHex);
      let aset = actorToSockets.get(actorHex);
      if (aset === undefined) {
        aset = new Set();
        actorToSockets.set(actorHex, aset);
      }
      aset.add(ws);
    },

    detachSubscriber(ws) {
      const topics = socketTopics.get(ws);
      if (topics !== undefined) {
        for (const t of topics) {
          removeFromTopic(t, ws);
        }
        socketTopics.delete(ws);
      }
      const actorHex = socketActor.get(ws);
      if (actorHex !== undefined) {
        socketActor.delete(ws);
        const aset = actorToSockets.get(actorHex);
        if (aset !== undefined) {
          aset.delete(ws);
          if (aset.size === 0) {
            actorToSockets.delete(actorHex);
          }
        }
      }
    },

    publishIntent(intent) {
      const set = topicToSockets.get(intent.topic);
      if (set === undefined) {
        return;
      }
      const payload = JSON.stringify(intent);
      for (const ws of set) {
        ws.send(payload);
      }
    },

    routeInviteResponse(response) {
      const set = actorToSockets.get(response.intentActorHex);
      if (set === undefined) {
        return;
      }
      const payload = JSON.stringify(response);
      for (const ws of set) {
        ws.send(payload);
      }
    },
  };
}
