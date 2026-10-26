/**
 * The English alphabet as reference data. Letter names follow General American with the British
 * "zed" noted; sounds list the most common spellings, not every one.
 */
export type Letter = { upper: string; name: string; ipa: string; vowel: boolean; sounds: { ipa: string; word: string }[]; examples: string[] };

const L = (upper: string, name: string, ipa: string, sounds: [string, string][], examples: string[], vowel = false): Letter => ({
  upper,
  name,
  ipa,
  vowel,
  sounds: sounds.map(([s, word]) => ({ ipa: s, word })),
  examples,
});

export const ALPHABET: Letter[] = [
  L("A", "a", "/eɪ/", [["/æ/", "cat"], ["/eɪ/", "name"], ["/ɑː/", "car"]], ["apple", "air", "after"], true),
  L("B", "bee", "/biː/", [["/b/", "bag"]], ["book", "bus", "bread"]),
  L("C", "cee", "/siː/", [["/k/", "cat"], ["/s/", "city"]], ["coffee", "cold", "cinema"]),
  L("D", "dee", "/diː/", [["/d/", "dog"]], ["day", "door", "doctor"]),
  L("E", "e", "/iː/", [["/e/", "bed"], ["/iː/", "me"]], ["egg", "evening", "eleven"], true),
  L("F", "ef", "/ef/", [["/f/", "fish"]], ["family", "food", "friend"]),
  L("G", "gee", "/dʒiː/", [["/ɡ/", "go"], ["/dʒ/", "giant"]], ["garden", "green", "girl"]),
  L("H", "aitch", "/eɪtʃ/", [["/h/", "hat"]], ["house", "happy", "hello"]),
  L("I", "i", "/aɪ/", [["/ɪ/", "sit"], ["/aɪ/", "time"]], ["ice", "idea", "island"], true),
  L("J", "jay", "/dʒeɪ/", [["/dʒ/", "job"]], ["juice", "jacket", "June"]),
  L("K", "kay", "/keɪ/", [["/k/", "key"]], ["kitchen", "kind", "king"]),
  L("L", "el", "/el/", [["/l/", "leg"]], ["lemon", "light", "letter"]),
  L("M", "em", "/em/", [["/m/", "map"]], ["mother", "money", "morning"]),
  L("N", "en", "/en/", [["/n/", "name"]], ["night", "number", "nose"]),
  L("O", "o", "/oʊ/", [["/ɒ/ or /ɑː/", "hot"], ["/oʊ/", "home"], ["/ʌ/", "mother"]], ["orange", "open", "office"], true),
  L("P", "pee", "/piː/", [["/p/", "pen"]], ["park", "phone", "people"]),
  L("Q", "cue", "/kjuː/", [["/kw/", "queen"]], ["question", "quiet", "quick"]),
  L("R", "ar", "/ɑːr/", [["/r/", "red"]], ["rain", "room", "river"]),
  L("S", "ess", "/es/", [["/s/", "sun"], ["/z/", "is"]], ["school", "sister", "summer"]),
  L("T", "tee", "/tiː/", [["/t/", "ten"], ["/θ/ in th", "think"], ["/ð/ in th", "this"]], ["table", "teacher", "town"]),
  L("U", "u", "/juː/", [["/ʌ/", "cup"], ["/juː/", "music"], ["/ʊ/", "put"]], ["umbrella", "uncle", "under"], true),
  L("V", "vee", "/viː/", [["/v/", "van"]], ["village", "visit", "voice"]),
  L("W", "double-u", "/ˈdʌbəl.juː/", [["/w/", "water"]], ["window", "winter", "work"]),
  L("X", "ex", "/eks/", [["/ks/", "box"], ["/z/", "xylophone"]], ["taxi", "six", "next"]),
  L("Y", "wye", "/waɪ/", [["/j/", "yes"], ["/aɪ/", "my"], ["/i/", "happy"]], ["yellow", "year", "young"]),
  L("Z", "zee (US) · zed (UK)", "/ziː/ · /zed/", [["/z/", "zoo"]], ["zero", "zebra", "zone"]),
];
