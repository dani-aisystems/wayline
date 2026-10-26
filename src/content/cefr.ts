import type { LocalizedText } from "./schema";

/** Short paraphrases of the CEFR global scale (not the official wording). */
export const CEFR_LEVELS: { band: string; name: LocalizedText; summary: LocalizedText; examples: LocalizedText }[] = [
  {
    band: "A1",
    name: { en: "Beginner", bg: "Начинаещ" },
    summary: {
      en: "You understand and use familiar everyday expressions and very basic phrases. You can introduce yourself and answer simple questions if people speak slowly and clearly.",
      bg: "Разбираш и използваш познати ежедневни изрази и съвсем прости фрази. Можеш да се представиш и да отговориш на прости въпроси, ако хората говорят бавно и ясно.",
    },
    examples: { en: "Say your name and where you're from · order a coffee · understand numbers and prices", bg: "Да кажеш името си и откъде си · да поръчаш кафе · да разбираш числа и цени" },
  },
  {
    band: "A2",
    name: { en: "Elementary", bg: "Елементарно ниво" },
    summary: {
      en: "You understand sentences about familiar topics such as family, shopping and work. You can handle short, routine exchanges and describe your background in simple terms.",
      bg: "Разбираш изречения по познати теми като семейство, пазаруване и работа. Справяш се с кратки рутинни разговори и описваш себе си с прости думи.",
    },
    examples: { en: "Talk about last weekend · ask for directions · make simple plans", bg: "Да разкажеш за миналия уикенд · да питаш за посока · да правиш прости планове" },
  },
  {
    band: "B1",
    name: { en: "Intermediate", bg: "Средно ниво" },
    summary: {
      en: "You understand the main points of clear speech on familiar matters. You can deal with most travel situations, describe experiences and give brief reasons for opinions and plans.",
      bg: "Разбираш основното в ясна реч по познати теми. Справяш се с повечето ситуации при пътуване, описваш преживявания и обясняваш накратко мнения и планове.",
    },
    examples: { en: "Give advice · tell a story · explain a problem to a hotel or shop", bg: "Да дадеш съвет · да разкажеш история · да обясниш проблем в хотел или магазин" },
  },
  {
    band: "B2",
    name: { en: "Upper intermediate", bg: "Над средното ниво" },
    summary: {
      en: "You understand the main ideas of complex texts and can talk with fluency and spontaneity with native speakers without strain for either side. You can explain a viewpoint with advantages and disadvantages.",
      bg: "Разбираш основните идеи на сложни текстове и говориш свободно и спонтанно с носители на езика без затруднение за двете страни. Можеш да обясниш позиция с предимства и недостатъци.",
    },
    examples: { en: "Take part in a work meeting · argue a point · follow most films", bg: "Да участваш в работна среща · да защитиш позиция · да следиш повечето филми" },
  },
  {
    band: "C1",
    name: { en: "Advanced", bg: "Напреднало ниво" },
    summary: {
      en: "You understand demanding, longer texts and recognise implicit meaning. You express yourself fluently and flexibly for social, academic and professional purposes, with well-structured detail.",
      bg: "Разбираш сложни, по-дълги текстове и улавяш скрит смисъл. Изразяваш се свободно и гъвкаво за социални, академични и професионални цели, с добре подредени подробности.",
    },
    examples: { en: "Write a clear report · signal your stance · use emphasis naturally", bg: "Да напишеш ясен доклад · да покажеш позицията си · да използваш естествено акцент и емфаза" },
  },
  {
    band: "C2",
    name: { en: "Proficient", bg: "Владеене" },
    summary: {
      en: "You understand virtually everything you hear or read. You summarise from different sources and express yourself spontaneously and very precisely, distinguishing finer shades of meaning.",
      bg: "Разбираш почти всичко, което чуваш или четеш. Обобщаваш от различни източници и се изразяваш спонтанно и много точно, като различаваш фини нюанси в смисъла.",
    },
    examples: { en: "Read between the lines · choose the exact word · adjust tone to any audience", bg: "Да четеш между редовете · да избереш точната дума · да нагласиш тона за всяка публика" },
  },
];
