import { retrievalSimilarityOntology } from "@khoralabs/memories-autolink";
import { mergeOntologies } from "@khoralabs/memories-core/helpers";
import { exedraOntology } from "../../../app/src/server/memories/exedra-ontology.ts";

/** Client ontology for remote agent sessions (includes retrieval autolink edge kinds). */
export const exedraMemoriesOntology = mergeOntologies(exedraOntology, retrievalSimilarityOntology);
