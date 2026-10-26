import { DiagBank, type DiagItem } from "./diagnostic";

const modules = import.meta.glob("./diagnostic/*.json", { eager: true, import: "default" });

/** The placement item bank, validated at load. Empty if no bank file is bundled. */
export const diagBank: Map<string, DiagItem> = new Map(
  Object.values(modules).flatMap((raw) => DiagBank.parse(raw).items.map((i) => [i.id, i] as const)),
);
