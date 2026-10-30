/**
 * Weakness tags for exam questions. Each question carries exactly one tag naming the skill or language
 * point it really tests, so results can be traced back to theory (TagLesson) and fresh practice.
 * Keep this list closed: the validator rejects unknown tags.
 */
export const EXAM_TAGS = {
  // Use of English: grammar
  "uoe.tenses": "Verb tenses and aspect",
  "uoe.passive": "Passive voice",
  "uoe.conditionals": "Conditionals and alternatives to if",
  "uoe.reported-speech": "Reported speech and reporting verbs",
  "uoe.modals": "Modal verbs (obligation, possibility, deduction)",
  "uoe.relative-clauses": "Relative clauses",
  "uoe.linking": "Linking words and contrast/concession",
  "uoe.prepositions": "Prepositions",
  "uoe.dependent-prepositions": "Dependent prepositions",
  "uoe.articles-determiners": "Articles, determiners and quantifiers",
  "uoe.comparison": "Comparatives, superlatives and comparison structures",
  "uoe.inversion": "Inversion and emphasis",
  "uoe.cleft": "Cleft sentences",
  "uoe.causative": "Causative have/get",
  "uoe.wish-regret": "Wish, if only, would rather, regret",
  "uoe.verb-patterns": "Gerund and infinitive patterns",
  "uoe.auxiliaries": "Auxiliary verbs and verb forms",
  "uoe.pronouns-reference": "Pronouns and reference words",
  // Use of English: vocabulary
  "uoe.phrasal-verbs": "Phrasal verbs",
  "uoe.collocations": "Collocations",
  "uoe.fixed-phrases": "Fixed phrases and expressions",
  "uoe.idioms": "Idioms",
  "uoe.word-choice": "Choosing the precise word (near-synonyms)",
  "uoe.complementation": "What follows a word (complementation)",
  // Word formation
  "wf.noun-suffix": "Forming nouns (-tion, -ment, -ity, -ance…)",
  "wf.adjective-suffix": "Forming adjectives (-able, -ive, -ous, -al…)",
  "wf.adverb": "Forming adverbs",
  "wf.verb-formation": "Forming verbs (-ise/-ize, -en, en-…)",
  "wf.negative-prefix": "Negative prefixes (un-, in-, im-, ir-, dis-, mis-)",
  "wf.internal-change": "Internal changes (long → length)",
  "wf.compound": "Compounds",
  "wf.plural-agreement": "Plural and agreement in the gap",
  // Reading
  "read.detail": "Understanding detail",
  "read.gist": "Main idea (gist)",
  "read.opinion-attitude": "Opinion and attitude",
  "read.inference": "Inference and implication",
  "read.purpose": "Writer's purpose",
  "read.tone": "Tone",
  "read.vocabulary-context": "Vocabulary in context",
  "read.reference": "Reference (what words refer to)",
  "read.cohesion": "Cohesion and text structure",
  "read.comparing-opinions": "Comparing opinions across texts",
  "read.specific-info": "Locating specific information",
  // Listening
  "listen.gist": "Listening for gist",
  "listen.detail": "Listening for detail",
  "listen.attitude-feeling": "Attitude and feeling",
  "listen.opinion": "Opinion",
  "listen.purpose-function": "Purpose and function",
  "listen.inference": "Inference",
  "listen.specific-info": "Specific information",
  "listen.agreement": "Agreement between speakers",
  // Writing and speaking (used in feedback)
  "write.content": "Writing: content",
  "write.communicative": "Writing: communicative achievement",
  "write.organisation": "Writing: organisation",
  "write.language": "Writing: language",
  "speak.interview": "Speaking: interview",
  "speak.long-turn": "Speaking: long turn",
  "speak.collaboration": "Speaking: collaborative task",
  "speak.discussion": "Speaking: discussion",
} as const;
export type ExamTag = keyof typeof EXAM_TAGS;
export const isExamTag = (t: string): t is ExamTag => t in EXAM_TAGS;
