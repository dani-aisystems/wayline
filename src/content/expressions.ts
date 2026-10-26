import type { Band, GlossaryEntry, LocalizedText } from "./schema";

/**
 * Curated multi-word expressions, A1–C2. Each says what it means, when to use it, its register, and
 * which nearby phrases differ. Draft content (author: claude) — needs native-speaker review.
 */
export type Register = "informal" | "neutral" | "formal";
export type ExprCategory = "everyday" | "conversation" | "phrasal" | "collocation" | "idiom" | "professional" | "academic";
export type Expression = {
  text: string;
  band: Exclude<Band, "preA1">;
  category: ExprCategory;
  register: Register;
  meaning: LocalizedText;
  use: LocalizedText;
  example: string;
  related: string[];
};

const E = (text: string, band: Expression["band"], category: ExprCategory, register: Register, meaning: [string, string], use: [string, string], example: string, related: string[] = []): Expression => ({
  text, band, category, register, meaning: { en: meaning[0], bg: meaning[1] }, use: { en: use[0], bg: use[1] }, example, related,
});

export const EXPRESSIONS: Expression[] = [
  // A1
  E("Nice to meet you", "A1", "everyday", "neutral", ["A polite thing to say when you meet someone for the first time.", "Приятно ми е да се запознаем."], ["Only the first time you meet. Later, say \"Nice to see you\".", "Само при първа среща. После казваш \"Nice to see you\"."], "Hi, I'm Tom. — Nice to meet you, Tom.", ["Nice to see you", "Pleased to meet you"]),
  E("How are you?", "A1", "conversation", "neutral", ["A greeting that asks how someone is.", "Как си?"], ["Usually answered briefly: \"Fine, thanks. And you?\" It isn't a request for details.", "Обикновено се отговаря кратко: \"Fine, thanks. And you?\" Не очаква подробности."], "Hi Anna! How are you? — Good, thanks. And you?", ["How's it going?", "How are you doing?"]),
  E("Excuse me", "A1", "everyday", "neutral", ["Used to get someone's attention politely, or to pass someone.", "Извинете (за привличане на внимание или за да минеш)."], ["Before a question to a stranger. To apologise after a mistake, say \"Sorry\".", "Преди въпрос към непознат. За извинение след грешка казваш \"Sorry\"."], "Excuse me, where is the station?", ["Sorry", "Pardon?"]),
  E("Can I have…, please?", "A1", "everyday", "neutral", ["A polite way to ask for something in a shop or café.", "Учтив начин да поискаш нещо в магазин или кафене."], ["Ordering food and drinks, buying things. \"I want…\" can sound rude.", "За поръчка и пазаруване. \"I want…\" може да звучи грубо."], "Can I have a coffee, please?", ["Could I have…?", "I'd like…"]),
  E("See you later", "A1", "conversation", "informal", ["Goodbye, when you expect to see the person again.", "Ще се видим (довиждане)."], ["With friends and colleagues. It doesn't have to mean the same day.", "С приятели и колеги. Не означава непременно същия ден."], "I'm going home now. See you later!", ["See you soon", "Bye for now"]),
  E("Thank you very much", "A1", "everyday", "neutral", ["A stronger way to say thank you.", "Много благодаря."], ["Any situation. \"Thanks a lot\" is more informal.", "Във всяка ситуация. \"Thanks a lot\" е по-неформално."], "Here's your bag. — Thank you very much!", ["Thanks a lot", "Cheers (UK, informal)"]),
  // A2
  E("I'd like to…", "A2", "everyday", "neutral", ["A polite way to say what you want to do.", "Бих искал/а да…"], ["Booking, ordering, making requests. Softer than \"I want to\".", "При резервации, поръчки и молби. По-меко от \"I want to\"."], "I'd like to book a table for two.", ["Can I have…?", "Would it be possible to…?"]),
  E("What about…?", "A2", "conversation", "informal", ["Used to suggest something.", "Какво ще кажеш за…?"], ["Making plans with friends. Followed by a noun or -ing: \"What about going…\".", "При правене на планове. Следва съществително или -ing: \"What about going…\"."], "What about Saturday? Are you free?", ["How about…?", "Why don't we…?"]),
  E("look for", "A2", "phrasal", "neutral", ["To try to find something.", "Търся."], ["\"Look for\" is the search; \"find\" is the result.", "\"Look for\" е търсенето, \"find\" е намирането."], "I'm looking for my keys. Have you seen them?", ["find", "look up"]),
  E("get up", "A2", "phrasal", "neutral", ["To get out of bed.", "Ставам (от леглото)."], ["Daily routines. \"Wake up\" is opening your eyes; \"get up\" is leaving the bed.", "За ежедневието. \"Wake up\" е събуждане, \"get up\" е ставане."], "I usually get up at seven.", ["wake up", "stay in bed"]),
  E("It depends", "A2", "conversation", "neutral", ["The answer changes with the situation.", "Зависи."], ["Add \"on\" + the thing: \"It depends on the weather.\"", "Добави \"on\" + нещото: \"It depends on the weather.\""], "Are you coming tomorrow? — It depends on my work.", ["Maybe", "That depends"]),
  E("Sorry I'm late", "A2", "everyday", "neutral", ["An apology for arriving late.", "Извинявай, че закъснях."], ["Add a short reason if you have one.", "Добави кратка причина, ако има такава."], "Sorry I'm late — the bus didn't come.", ["Sorry to keep you waiting"]),
  // B1
  E("make a decision", "B1", "collocation", "neutral", ["To decide.", "Вземам решение."], ["English uses \"make\", not \"take\", in most varieties: make a decision, make a mistake.", "На английски обикновено е \"make\", не \"take\": make a decision, make a mistake."], "We need to make a decision by Friday.", ["take a decision (UK, formal)", "come to a decision"]),
  E("If I were you, I'd…", "B1", "conversation", "neutral", ["A way to give advice.", "На твое място бих…"], ["Friendly advice. \"You should…\" is more direct.", "За приятелски съвет. \"You should…\" е по-директно."], "If I were you, I'd talk to your manager first.", ["You should…", "Why don't you…?"]),
  E("I'm not sure about that", "B1", "conversation", "neutral", ["A polite way to disagree or show doubt.", "Не съм сигурен/на за това (учтиво несъгласие)."], ["Softer than \"I disagree\". Useful in discussions with people you don't know well.", "По-меко от \"I disagree\". Полезно в разговор с по-непознати хора."], "We should move the meeting to Monday. — I'm not sure about that.", ["I see what you mean, but…", "I disagree"]),
  E("give up", "B1", "phrasal", "neutral", ["To stop trying, or to stop doing a habit.", "Отказвам се; спирам (навик)."], ["\"Give up + -ing\": give up smoking.", "\"Give up + -ing\": give up smoking."], "Don't give up — you're nearly there.", ["quit", "keep going"]),
  E("It's worth it", "B1", "everyday", "neutral", ["The effort or cost brings a good result.", "Струва си."], ["\"It's worth + -ing\": It's worth visiting.", "\"It's worth + -ing\": It's worth visiting."], "The tickets are expensive, but it's worth it.", ["It's not worth it", "It pays off"]),
  E("in the end", "B1", "everyday", "neutral", ["Finally, after some time or problems.", "Накрая, в крайна сметка."], ["Different from \"at the end (of)\", which is a point in time or place.", "Различно от \"at the end (of)\", което е момент или място."], "We were lost for an hour, but in the end we found the hotel.", ["at the end of", "eventually"]),
  // B2
  E("to be honest", "B2", "conversation", "neutral", ["Used before saying what you really think, often something unwelcome.", "Честно казано."], ["Softens criticism or a surprising opinion.", "Смекчава критика или неочаквано мнение."], "To be honest, I don't think the plan will work.", ["frankly", "to tell you the truth"]),
  E("on the other hand", "B2", "academic", "neutral", ["Introduces a contrasting point.", "От друга страна."], ["Best after \"On the one hand…\" or a first point. Not for simple \"but\" contrasts.", "Най-добре след \"On the one hand…\" или първи аргумент. Не замества просто \"but\"."], "The job pays well. On the other hand, the hours are long.", ["however", "whereas"]),
  E("keep me posted", "B2", "professional", "informal", ["Tell me about new developments.", "Дръж ме в течение."], ["Emails and chats with colleagues. More formal: \"Please keep me informed.\"", "В имейли и чатове с колеги. По-официално: \"Please keep me informed.\""], "Thanks for the update — keep me posted.", ["keep me in the loop", "keep me informed"]),
  E("touch base", "B2", "professional", "informal", ["To make brief contact to check progress.", "Да се чуем накратко (за проверка)."], ["Business talk; some people find it jargon. Neutral alternative: \"check in\".", "Бизнес жаргон; някои не го харесват. Неутрално: \"check in\"."], "Let's touch base on Thursday about the budget.", ["check in", "catch up"]),
  E("come up with", "B2", "phrasal", "neutral", ["To think of an idea or plan.", "Измислям (идея, план)."], ["Ideas, solutions, names. Not for remembering.", "За идеи, решения, имена. Не за спомняне."], "She came up with a clever solution.", ["think of", "devise (formal)"]),
  E("I see your point, but…", "B2", "conversation", "neutral", ["Acknowledges someone's argument before disagreeing.", "Разбирам какво имаш предвид, но…"], ["Keeps a discussion polite while you disagree.", "Запазва разговора учтив, докато изразяваш несъгласие."], "I see your point, but the cost is still too high.", ["I take your point", "That's true, but…"]),
  // C1
  E("I'm inclined to agree", "C1", "conversation", "formal", ["I mostly agree, after some thought.", "Склонен/на съм да се съглася."], ["More measured than \"I agree\": it signals you've considered it and stay slightly open. Common in meetings and academic talk.", "По-премерено от \"I agree\": показва, че си обмислил и оставаш леко отворен. Често на срещи и в академична реч."], "Given the figures, I'm inclined to agree with Maria.", ["I agree", "I'd go along with that", "I couldn't agree more"]),
  E("with a view to", "C1", "academic", "formal", ["With the aim of (+ -ing).", "С цел да…"], ["Formal writing. Followed by -ing, not the infinitive.", "Официален стил. Следва -ing, не инфинитив."], "The data was collected with a view to improving the service.", ["in order to", "with the aim of"]),
  E("bear in mind", "C1", "collocation", "neutral", ["To remember a fact that affects a decision.", "Имам предвид, вземам под внимание."], ["\"Bear in mind that…\" sounds more careful than \"remember that…\".", "\"Bear in mind that…\" звучи по-премерено от \"remember that…\"."], "Bear in mind that prices may change.", ["take into account", "keep in mind"]),
  E("a far cry from", "C1", "idiom", "neutral", ["Very different from.", "Далеч от, съвсем различно от."], ["Usually comparing a current situation with an earlier or expected one.", "Обикновено сравнява сегашно положение с предишно или очаквано."], "The new office is a far cry from the tiny room we started in.", ["nothing like", "worlds apart"]),
  E("to put it mildly", "C1", "conversation", "neutral", ["Said when the truth is stronger than your words.", "Меко казано."], ["Adds irony: the situation is worse (or better) than described.", "Добавя ирония: положението е по-лошо (или по-добро) от казаното."], "The launch was disappointing, to put it mildly.", ["to say the least", "an understatement"]),
  E("it remains to be seen", "C1", "academic", "formal", ["It is not yet known.", "Предстои да видим."], ["Cautious predictions in reports and news.", "За предпазливи прогнози в доклади и новини."], "Whether the policy will work remains to be seen.", ["time will tell", "it is unclear"]),
  // C2
  E("by no means", "C2", "academic", "formal", ["Not at all.", "В никакъв случай, съвсем не."], ["At the start of a sentence it triggers inversion: \"By no means is this…\".", "В началото на изречение изисква инверсия: \"By no means is this…\"."], "The result is by no means certain.", ["not at all", "far from"]),
  E("damn with faint praise", "C2", "idiom", "informal", ["To criticise by praising weakly.", "Да критикуваш чрез сдържана похвала."], ["Describes a review or reference that says little that is positive.", "За отзив или препоръка, които казват малко положително."], "Calling the novel \"perfectly adequate\" damns it with faint praise.", ["backhanded compliment", "lukewarm"]),
  E("read between the lines", "C2", "idiom", "neutral", ["To understand what is meant but not said.", "Чета между редовете."], ["Implied meaning in letters, emails, speeches.", "За подразбиращ се смисъл в писма, имейли, речи."], "Reading between the lines, the company is in trouble.", ["implication", "subtext"]),
  E("not to put too fine a point on it", "C2", "conversation", "neutral", ["To speak plainly about something unpleasant.", "Казано направо."], ["Warns that you're about to be blunt.", "Предупреждава, че ще бъдеш директен."], "Not to put too fine a point on it, the project has failed.", ["frankly", "bluntly"]),
  E("a moot point", "C2", "academic", "neutral", ["A question that is debatable, or no longer relevant.", "Спорен (или вече неактуален) въпрос."], ["UK use leans \"debatable\"; US use leans \"no longer relevant\". Context decides.", "Във Великобритания е по-скоро \"спорен\", в САЩ \"вече без значение\". Контекстът решава."], "Whether we could have won is a moot point now.", ["debatable", "academic (irrelevant)"]),
  E("to all intents and purposes", "C2", "collocation", "formal", ["In every practical way; almost completely.", "На практика, по същество."], ["Often misheard as \"for all intensive purposes\" — avoid that.", "Често се бърка с \"for all intensive purposes\" — избягвай го."], "The deal is, to all intents and purposes, finished.", ["in effect", "virtually"]),
];

/** An expression as a reviewable card entry (same shape as Word Lens entries). */
export function expressionEntry(e: Expression): GlossaryEntry {
  return { word: e.text, pos: "phrase", meaning: e.meaning, example: e.example, forms: [], band: e.band };
}
