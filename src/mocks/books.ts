/**
 * DEV/TEST-ONLY book library of the mock API (contract 0.9.3): an in-memory
 * store of staff-uploaded books and a time-based simulation of the server's
 * reading (pages → contents → sections → book → done). Nothing runs on a
 * timer: each read of a book advances it to where it would be by now, so a
 * reload, an e2e test and a unit test all see the same progress.
 * Sections are a hand-made sample of «Физика 7» (Мамбетакунов, ky).
 */
import type { Book, BookSection, BookStage } from '@bilig/content-model/api';
import { API_PREFIX } from '@bilig/content-model/api';

export type MockBook = Book & {
  sections: BookSection[];
  /** Pages received (1-based). */
  pages: number[];
  /** Processing: when it (re)started and from which stage. */
  run?: { startedAt: number; from: Exclude<BookStage, 'done'> };
};

/** Speed of the simulation: tests set a small `scale` to read a book in milliseconds. */
export const bookSim = { scale: 1 };

/** Covers staff uploaded (data URLs), kept out of the persisted state (size). */
export const bookCovers = new Map<string, string>();

const PHASES: Exclude<BookStage, 'done'>[] = ['pages', 'contents', 'sections', 'book'];
const QUEUED_MS = 600;
const phaseMs = (b: MockBook, p: Exclude<BookStage, 'done'>): number =>
  bookSim.scale * (p === 'pages' ? Math.min(4000, 40 * Math.max(1, b.pageCount)) : p === 'contents' ? 900 : p === 'sections' ? 2400 : 600);
const phaseTotal = (b: MockBook, p: Exclude<BookStage, 'done'>): number => (p === 'pages' ? b.pageCount : p === 'sections' ? SAMPLE.length : 1);

export const coverPath = (id: string) => `${API_PREFIX}/books/${id}/cover`;

const sectionId = (bookId: string, i: number) => `${bookId.slice(0, 24)}${String(i + 1).padStart(12, '0')}`;

type Sample = Omit<BookSection, 'id' | 'order' | 'reviewed'>;
const CH1 = { chapterNumber: '1', chapterTitle: 'Механика. Кинематиканын негиздери' };
const SAMPLE: Sample[] = [
  {
    ...CH1,
    number: '4',
    kind: 'lesson',
    title: 'Нерсенин механикалык кыймылы. Кыймылдын траекториясы. Кыймылдын түрлөрү',
    pages: { from: 17, to: 18 },
    summary: 'Нерсенин башка нерселерге салыштырмалуу абалынын убакыт боюнча өзгөрүшү механикалык кыймыл деп аталат. Параграф эсептөө системасын, траекторияны жана кыймылдын түз сызыктуу жана ийри сызыктуу түрлөрүн түшүндүрөт.',
    objectives: ['Механикалык кыймылды аныктай алат', 'Траекторияга карап кыймылдын түрүн айырмалайт'],
    keyTerms: [
      { term: 'механикалык кыймыл', definition: 'Нерсенин башка нерселерге салыштырмалуу абалынын убакыттын өтүшү менен өзгөрүшү.' },
      { term: 'траектория', definition: 'Кыймылдагы нерсе мейкиндикте калтырган сызык.' },
      { term: 'эсептөө системасы', definition: 'Эсептөө нерсеси, ага байланган координаталар системасы жана саат.' },
    ],
    formulas: [],
    quantities: [{ name: 'убакыт', symbol: 't', unit: 'с' }],
    facts: ['Бир эле нерсе бир эсептөө системасында тынч, башкасында кыймылда болушу мүмкүн.'],
    experiments: ['Столдун үстүндө тоголонгон шардын изин бор менен белгилеп, траекторияны көрсөтүү.'],
    questions: ['Механикалык кыймыл деген эмне?', 'Траектория боюнча кыймылдар кандай түрлөргө бөлүнөт?', 'Поезддин ичинде отурган жүргүнчү кайсы нерселерге салыштырмалуу тынч абалда?'],
    keywords: ['кыймыл', 'траектория', 'эсептөө системасы', 'салыштырмалуулук'],
    topicKey: 'sim-kinematics',
  },
  {
    ...CH1,
    number: '5',
    kind: 'lesson',
    title: 'Жол жана которулуш',
    pages: { from: 19, to: 21 },
    summary: 'Жол — траекториянын узундугу, которулуш — баштапкы чекиттен акыркы чекитке багытталган кесинди. Параграф экөөнүн айырмасын жана качан алар барабар болорун мисалдар менен көрсөтөт.',
    objectives: ['Жол менен которулушту айырмалайт', 'Жөнөкөй учурларда жолду жана которулушту эсептейт'],
    keyTerms: [
      { term: 'жол', definition: 'Нерсе белгилүү убакыт ичинде басып өткөн траекториянын узундугу.' },
      { term: 'которулуш', definition: 'Нерсенин баштапкы абалын акыркы абалы менен туташтырган багытталган кесинди.' },
    ],
    formulas: [],
    quantities: [
      { name: 'жол', symbol: 's', unit: 'м' },
      { name: 'которулуш', symbol: 's⃗', unit: 'м' },
    ],
    facts: ['Түз сызыктуу бир багыттагы кыймылда жол которулуштун модулуна барабар.'],
    experiments: [],
    questions: ['Жол менен которулуштун айырмасы эмнеде?', 'Стадиондун айланасын бир жолу чуркап өткөн спортчунун которулушу канчага барабар?'],
    keywords: ['жол', 'которулуш', 'вектор'],
    topicKey: 'sim-kinematics',
  },
  {
    ...CH1,
    number: '6',
    kind: 'lesson',
    title: 'Кыймылдын ылдамдыгы. Бир калыптагы кыймыл',
    pages: { from: 22, to: 23 },
    summary: 'Бир калыптагы кыймылда нерсе бирдей убакыт аралыктарында бирдей жолдорду басып өтөт. Ылдамдык жолдун ошол жолго кеткен убакытка болгон катышы катары киргизилет.',
    objectives: ['Бир калыптагы кыймылды тааныйт', 'Ылдамдыкты v = s / t формуласы менен эсептейт', 'Ылдамдыктын бирдиктерин которот'],
    keyTerms: [
      { term: 'бир калыптагы кыймыл', definition: 'Каалагандай бирдей убакыт аралыктарында нерсе бирдей жолдорду басып өткөн кыймыл.' },
      { term: 'ылдамдык', definition: 'Нерсенин басып өткөн жолунун ага кеткен убакытка болгон катышына барабар физикалык чоңдук.' },
    ],
    formulas: [{ formula: 'v = s / t', meaning: 'Ылдамдык — жолдун убакытка катышы.' }],
    quantities: [
      { name: 'ылдамдык', symbol: 'v', unit: 'м/с' },
      { name: 'жол', symbol: 's', unit: 'м' },
      { name: 'убакыт', symbol: 't', unit: 'с' },
    ],
    facts: ['1 м/с = 3,6 км/саат.'],
    experiments: ['Суу толтурулган түтүктөгү аба көбүкчөсүнүн кыймылын секундомер менен өлчөө.'],
    questions: ['Кандай кыймыл бир калыптагы кыймыл деп аталат?', '72 км/саатты м/с менен туюнткула.', 'Велосипедчи 10 мүнөттө 3 км жол жүрдү. Анын ылдамдыгы канча?'],
    keywords: ['ылдамдык', 'бир калыптагы кыймыл', 'жол', 'убакыт'],
    topicKey: 'sim-kinematics',
  },
  {
    ...CH1,
    number: '9',
    kind: 'lesson',
    title: 'Ылдамдануу',
    pages: { from: 30, to: 31 },
    summary: 'Ылдамдануу — ылдамдыктын өзгөрүшүнүн ошол өзгөрүүгө кеткен убакытка болгон катышы. Параграф бир калыптагы ылдамдатылган кыймылды жана ылдамдануунун бирдигин киргизет.',
    objectives: ['Ылдамдануунун физикалык маанисин түшүндүрөт', 'a = (v − v₀) / t формуласы менен ылдамданууну эсептейт'],
    keyTerms: [{ term: 'ылдамдануу', definition: 'Ылдамдыктын өзгөрүшүнүн ушул өзгөрүү болгон убакыт аралыгына катышы.' }],
    formulas: [{ formula: 'a = (v − v₀) / t', meaning: 'Ылдамдануу — убакыт бирдигиндеги ылдамдыктын өзгөрүшү.' }],
    quantities: [
      { name: 'ылдамдануу', symbol: 'a', unit: 'м/с²' },
      { name: 'баштапкы ылдамдык', symbol: 'v₀', unit: 'м/с' },
    ],
    facts: ['Эркин түшкөн нерсенин ылдамдануусу болжол менен 9,8 м/с².'],
    experiments: [],
    questions: ['Ылдамдануу эмнени көрсөтөт?', 'Автомобиль 5 с ичинде ылдамдыгын 0дөн 20 м/с чейин көбөйттү. Ылдамдануусу канча?'],
    keywords: ['ылдамдануу', 'ылдамдатылган кыймыл'],
    topicKey: 'sim-kinematics',
  },
  {
    ...CH1,
    number: '11',
    kind: 'lesson',
    title: 'Нерсенин айлана боюнча кыймылы',
    pages: { from: 36, to: 39 },
    summary: 'Айлана боюнча бир калыптагы кыймылда ылдамдыктын модулу турактуу, бирок багыты дайыма өзгөрөт. Параграф айлануу мезгилин, жыштыгын жана борборго умтулуучу ылдамданууну киргизет.',
    objectives: ['Айлануу мезгилин жана жыштыгын аныктайт', 'Борборго умтулуучу ылдамдануунун багытын көрсөтөт'],
    keyTerms: [
      { term: 'айлануу мезгили', definition: 'Нерсе бир толук айланууга кетирген убакыт.' },
      { term: 'айлануу жыштыгы', definition: 'Убакыт бирдигиндеги айлануулардын саны.' },
    ],
    formulas: [
      { formula: 'T = t / N', meaning: 'Мезгил — убакыттын айлануулардын санына катышы.' },
      { formula: 'ν = 1 / T', meaning: 'Жыштык мезгилге тескери чоңдук.' },
    ],
    quantities: [
      { name: 'мезгил', symbol: 'T', unit: 'с' },
      { name: 'жыштык', symbol: 'ν', unit: 'Гц' },
    ],
    facts: ['Жер өз огунун айланасында 24 саатта бир жолу айланат.'],
    experiments: ['Жипке байланган шарикти айлантып, жипти коё бергенде шардын учуп кеткен багытын байкоо.'],
    questions: ['Айлануу мезгили деген эмне?', 'Дөңгөлөк 2 с ичинде 10 жолу айланды. Анын мезгили жана жыштыгы канча?'],
    keywords: ['айлана', 'мезгил', 'жыштык', 'борборго умтулуучу ылдамдануу'],
    topicKey: null,
  },
  {
    ...CH1,
    number: '',
    kind: 'review',
    title: '«Кинематиканын негиздери» темасы боюнча тесттик тапшырмалардын үлгүлөрү',
    pages: { from: 40, to: 41 },
    summary: 'Бөлүм боюнча тесттик тапшырмалар: кыймылдын түрлөрү, жол жана которулуш, ылдамдык, ылдамдануу, айлана боюнча кыймыл.',
    objectives: ['Кинематика боюнча билимин текшерет'],
    keyTerms: [],
    formulas: [],
    quantities: [],
    facts: [],
    experiments: [],
    questions: ['Төмөнкүлөрдүн кайсынысы ылдамдыктын бирдиги? А) м  Б) м/с  В) с  Г) м/с²', 'Нерсе 4 с ичинде 20 м жол жүрдү. Ылдамдыгы канча?'],
    keywords: ['кинематика', 'тест'],
    topicKey: null,
  },
  {
    chapterNumber: '2',
    chapterTitle: 'Динамиканын негиздери',
    number: '13',
    kind: 'lesson',
    title: 'Инерция. Инерттүүлүк. Ньютондун биринчи закону',
    pages: { from: 44, to: 46 },
    summary: 'Башка нерселер аракет этпесе, нерсе өзүнүн тынч абалын же бир калыптагы түз сызыктуу кыймылын сактайт. Параграф инерция кубулушун жана Ньютондун биринчи законун түшүндүрөт.',
    objectives: ['Инерция кубулушун турмуштан мисалдар менен түшүндүрөт', 'Ньютондун биринчи законун айтып берет'],
    keyTerms: [
      { term: 'инерция', definition: 'Нерсенин ылдамдыгын башка нерселер аракет этпегенде сактоо кубулушу.' },
      { term: 'инерттүүлүк', definition: 'Нерсенин ылдамдыгын өзгөртүүгө «каршылык көрсөтүү» касиети.' },
    ],
    formulas: [],
    quantities: [],
    facts: ['Автобус кескин токтогондо жүргүнчүлөр алдыга ыргылышат.'],
    experiments: ['Стакандын үстүндөгү картонду кескин тартып, тыйындын стаканга түшүшүн көрсөтүү.'],
    questions: ['Инерция деген эмне?', 'Эмне үчүн автомобилде коопсуздук куру тагылат?'],
    keywords: ['инерция', 'Ньютондун закону', 'күч'],
    topicKey: 'sim-forces',
  },
];

export const sampleSections = (bookId: string, reviewed = false): BookSection[] => SAMPLE.map((s, i) => ({ ...s, id: sectionId(bookId, i), order: i, reviewed }));

const META = {
  title: 'Физика, 7-класс',
  authors: ['Э. М. Мамбетакунов'],
  publisher: 'Билим',
  year: 2018,
  summary: 'Жалпы билим берүүчү мектептердин 7-классы үчүн физика окуу китеби. Механиканын негиздерин: кинематиканы, динамиканы, басымды, жумуш жана энергияны, статиканы, термелүүлөрдү жана толкундарды камтыйт; ар бир параграфтан кийин суроолор жана лабораториялык иштер берилген.',
};

export const BOOK_PHYS7_ID = '0192a000-0000-7000-8000-0000000000b7';

export function newMockBook(o: { id: string; fileName: string; subjectKey: string; grade: number; lang: Book['lang']; pageCount: number; title?: string; part?: number }): MockBook {
  const at = new Date().toISOString();
  return {
    id: o.id,
    kind: 'textbook',
    title: o.title?.trim() || o.fileName.replace(/\.pdf$/i, '').slice(0, 300) || 'Book',
    subjectKey: o.subjectKey,
    grade: o.grade,
    lang: o.lang,
    part: o.part ?? null,
    authors: [],
    publisher: '',
    year: null,
    summary: '',
    status: 'uploading',
    stage: 'pages',
    progress: { done: 0, total: o.pageCount },
    error: null,
    pageCount: o.pageCount,
    pagesUploaded: 0,
    sectionCount: 0,
    usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, costUsd: 0 },
    fileName: o.fileName,
    coverUrl: null,
    createdAt: at,
    updatedAt: at,
    publishedAt: null,
    sections: [],
    pages: [],
  };
}

/** The published «Физика 7» every demo starts with. */
export function seedBooks(): MockBook[] {
  const b = newMockBook({ id: BOOK_PHYS7_ID, fileName: 'fizika-7-mambetakunov.pdf', subjectKey: 'phys', grade: 7, lang: 'ky', pageCount: 168, title: META.title });
  const at = new Date(Date.now() - 3 * 86400_000).toISOString();
  return [
    {
      ...b,
      ...META,
      status: 'published',
      stage: 'done',
      progress: { done: SAMPLE.length, total: SAMPLE.length },
      pagesUploaded: 168,
      pages: Array.from({ length: 168 }, (_, i) => i + 1),
      sections: sampleSections(BOOK_PHYS7_ID, true),
      sectionCount: SAMPLE.length,
      usage: { inputTokens: 1_480_000, cachedInputTokens: 920_000, outputTokens: 96_000, costUsd: 3.42 },
      coverUrl: coverPath(BOOK_PHYS7_ID),
      createdAt: at,
      updatedAt: at,
      publishedAt: at,
    },
  ];
}

/** Bring a queued / processing book to where the simulated reading would be now. */
export function advanceBook(b: MockBook, now = Date.now()): MockBook {
  if (!b.run || (b.status !== 'queued' && b.status !== 'processing')) return b;
  let t = now - b.run.startedAt - QUEUED_MS * bookSim.scale;
  if (t < 0) {
    b.status = 'queued';
    b.stage = b.run.from;
    b.progress = { done: 0, total: phaseTotal(b, b.run.from) };
    return b;
  }
  b.status = 'processing';
  const usageAt = (f: number) => {
    // Rough cost of a whole book: about $0.02 a page.
    const pages = b.pageCount * f;
    b.usage = { inputTokens: Math.round(pages * 9000), cachedInputTokens: Math.round(pages * 5500), outputTokens: Math.round(pages * 600), costUsd: Math.round(pages * 2) / 100 };
  };
  const startIdx = PHASES.indexOf(b.run.from);
  for (let i = startIdx; i < PHASES.length; i++) {
    const p = PHASES[i];
    const ms = phaseMs(b, p);
    if (t < ms) {
      const total = phaseTotal(b, p);
      b.stage = p;
      b.progress = { done: Math.min(total, Math.floor((t / ms) * total)), total };
      usageAt((i + t / ms) / PHASES.length);
      if (p === 'sections') b.sectionCount = SAMPLE.length;
      b.updatedAt = new Date(now).toISOString();
      return b;
    }
    t -= ms;
  }
  // Done: the book is read and waits for staff.
  b.status = 'review';
  b.stage = 'done';
  b.progress = { done: SAMPLE.length, total: SAMPLE.length };
  b.sections = sampleSections(b.id);
  b.sectionCount = b.sections.length;
  b.authors = b.authors.length ? b.authors : META.authors;
  b.publisher ||= META.publisher;
  b.year ??= META.year;
  b.summary ||= META.summary;
  usageAt(1);
  b.updatedAt = new Date(now).toISOString();
  delete b.run;
  return b;
}

export const bookDto = (b: MockBook): Book => {
  const { sections: _s, pages: _p, run: _r, ...book } = b;
  return book;
};

/** A placeholder cover: the title on the subject's colour band. */
export function coverSvg(b: Pick<Book, 'title' | 'grade' | 'subjectKey'>): string {
  const hue = [...b.subjectKey].reduce((n, c) => n + c.charCodeAt(0), 0) % 360;
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  const words = b.title.split(/\s+/);
  const lines: string[] = [];
  for (const w of words) {
    const last = lines[lines.length - 1];
    if (last && (last + ' ' + w).length <= 16) lines[lines.length - 1] = `${last} ${w}`;
    else lines.push(w);
  }
  const text = lines
    .slice(0, 5)
    .map((l, i) => `<text x="60" y="${190 + i * 44}" font-size="34" font-weight="700" fill="#fff" font-family="sans-serif">${esc(l)}</text>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="840" viewBox="0 0 600 840"><rect width="600" height="840" fill="hsl(${hue} 55% 38%)"/><rect x="0" y="0" width="34" height="840" fill="hsl(${hue} 55% 28%)"/>${text}<text x="60" y="760" font-size="64" font-weight="800" fill="#fff" font-family="sans-serif">${b.grade}</text></svg>`;
}
