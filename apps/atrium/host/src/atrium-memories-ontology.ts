import { mergeOntologies, retrievalAutolinkOntology } from "@khoralabs/memories-autolink";
import { swarmHostOntology } from "@khoralabs/swarm-host";

/** Swarm host ontology plus retrieval autolink edge/node kinds for Atrium merges. */
export const atriumMemoriesOntology = mergeOntologies(swarmHostOntology, retrievalAutolinkOntology);

export type AtriumMemoriesTNode = (typeof atriumMemoriesOntology)["nodeLabels"];
export type AtriumMemoriesTEdge = (typeof atriumMemoriesOntology)["edgeLabels"];
