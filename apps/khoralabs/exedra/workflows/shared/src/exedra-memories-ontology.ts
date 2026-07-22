import { retrievalSimilarityOntology } from "@khoralabs/memories-node/autolink";
import { mergeOntologies } from "@khoralabs/memories-node/ontology";
import { exedraOntology } from "../../../app/src/server/memories/exedra-ontology.ts";

/** Client ontology for remote agent sessions (includes retrieval autolink edge kinds). */
export const exedraMemoriesOntology = mergeOntologies(exedraOntology, retrievalSimilarityOntology);
