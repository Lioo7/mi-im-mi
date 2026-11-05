// All user-visible UI strings. Functions take the dynamic parts.
// Count + noun with the singular spelled out: plural(1, 'נושא אחד', 'נושאים') → "נושא אחד"; plural(3, …) → "3 נושאים".
export const plural = (n, one, many) => (n === 1 ? one : `${n} ${many}`);
const topicsN = (n) => plural(n, 'נושא אחד', 'נושאים');
const inTopics = (n) => (n === 1 ? 'בנושא אחד' : `ב-${n} נושאים`);
// Head-on clashes with the parties outside the coalition: the snapshot's outside block and the share text.
const clashesN = (n) => (n === 0 ? 'אין סתירות חזיתיות' : n === 1 ? 'סתירה חזיתית אחת' : `${n} סתירות חזיתיות`);

export const S = {
  lang: 'he',
  dir: 'rtl',
  // Collation for the alphabetical lists (presets, scenarios).
  locale: 'he',
  // 2026-10-30 -> 30.10.2026
  fmtDate: (iso) => (iso ? iso.split('-').reverse().join('.') : ''),
  appName: 'מי עם מי',
  pageTitle: 'מי עם מי · בנו קואליציה וגלו איפה המפלגות מסכימות ואיפה הן מתנגשות',
  tagline: 'בנו קואליציה וגלו איפה המפלגות מסכימות ואיפה הן מתנגשות',
  updated: (d) => `עודכן ${d}`,
  stubBanner: 'נתוני דמה לפיתוח בלבד: העמדות אינן אמיתיות',
  skip: 'דלגו לתוצאות',
  loadError: 'שגיאה בטעינת הנתונים. נסו לרענן את הדף.',
  // The language switch shows both names, each in its own language; the current one is plain text.
  langSwitch: { label: 'שפה', other: 'en' },
  langNames: { he: 'עברית', en: 'English' },
  // Shown only on a translation (the Hebrew is the original).
  translatedNote: '',
  // A person or channel named in the data, in the reader's language (the data is in Hebrew).
  nameOf: (n) => n,

  nav: {
    method: 'איך זה עובד',
    // The header link on phones (≤400px), where the full label doesn't fit next to the language switch.
    methodShort: 'איך זה עובד',
    back: '← עריכה',
    toResults: 'לתוצאות ←',
    backFromMethod: '← חזרה',
    partyCount: (n) => `${plural(n, 'מפלגה אחת', 'מפלגות')} ${n === 1 ? 'נבחרה' : 'נבחרו'}`,
  },
  buildIntro: (n) => `איפה המפלגות מסכימות ואיפה הן מתנגשות, ${inTopics(n)}, עם מקור לכל עמדה.`,
  // The build view's task cards (#26), in a fixed order. Each line says what the tool shows, never what it concludes.
  home: {
    title: 'מה אפשר לעשות כאן',
    build: 'בנו קואליציה',
    buildLine: (n) => `בחרו מפלגות ותפקיד לכל אחת, וראו איפה הן מסכימות ואיפה הן מתנגשות ${inTopics(n)}.`,
    closest: 'מצאו קואליציות למפלגה',
    // The first two keys of the #22 order, exactly; the rest is on the method page (closestRule).
    closestLine: 'בחרו מפלגה וראו קואליציות של רוב שכוללות אותה. ראשונות: אלה שבהן נחצים פחות מהקווים האדומים שלה, ואם יש שוויון, אלה עם פחות נושאים בסתירה חזיתית איתה.',
    pair: 'השוו שתי מפלגות',
    pairLine: (n) => `העמדות המוצהרות של שתי מפלגות זו לצד זו ${inTopics(n)}, עם מקור לכל עמדה.`,
  },
  sourceMix: (n, p, s, r) => `${n} עמדות מתועדות: ${p} לפי מצע, ${s} לפי הצהרות, ${r} לפי רקורד.`,
  // Hours: CEC FAQ (gov.il): most stations 07:00–22:00; small localities, hospitals, prisons and care homes 08:00–20:00.
  voterInfo: 'יום הבחירות: יום שלישי, 27.10 · רוב הקלפיות פתוחות 7:00–22:00 ·',
  voterInfoLink: 'איפה אני מצביע?',
  // Interior Ministry polling-station lookup (gov.il blocks bots; verified by hand on 26.10.2026, see decisions.md).
  voterInfoUrl: 'https://www.gov.il/apps/moin/bocharim/',
  buildPurpose: 'העמדות לקוחות ממצעים, מהצהרות רשמיות ומהצעות חוק שהמפלגות יזמו או קידמו. זו לא המלצת הצבעה.',

  how: {
    title: 'איך זה עובד',
    lines: [
      'בחרו מפלגות, או התחילו מתרחיש מוכן ושנו אותו.',
      'לכל מפלגה מיקום ב-8 נושאים, לפי המצע, הצהרות רשמיות ורקורד בפועל (הצעות חוק שהמפלגה יזמה או קידמה), עם מקור.',
      'הצבע מראה את המרחק בין העמדות, לא מה נכון.',
    ],
    more: 'למתודולוגיה המלאה ←',
    tapHint: 'לחצו על כל תא או נושא כדי לראות את המקור ולמה הצבע הזה',
  },

  presets: {
    title: 'תרחישים מוכנים',
    'opposition-arab': 'אופוזיציה + תמיכה ערבית מבחוץ',
    unity: 'אחדות',
    opposition: 'גוש האופוזיציה',
    coalition: 'גוש הקואליציה',
    blocNote: 'חלוקת הגושים לפי בקלפי וחדשות 12.',
    // Results mode: media scenarios, named by composition only.
    scenariosTitle: (d) => `תרחישים שעלו בתקשורת · נכון ל-${d}`,
    scenariosNote: 'לחיצה על תרחיש ממלאת את הבחירה, ואפשר לשנות אותה. מפלגה שלא מופיעה בו נחשבת מתנגדת.',
    // The collapsed disclosure in the builder section (#26).
    scenariosStart: (n, d) => `או התחילו מתרחיש שעלה בתקשורת (${n}) · נכון ל-${d}`,
    presetsStart: 'או התחילו מתרחיש מוכן',
    scenarioLabel: (members, supporters, abstainers) => [
      members.join(' + '),
      supporters.length ? `${supporters.length === 1 ? 'תומכת' : 'תומכות'}: ${supporters.join(', ')}` : '',
      abstainers.length ? `${abstainers.length === 1 ? 'נמנעת' : 'נמנעות'}: ${abstainers.join(', ')}` : '',
    ].filter(Boolean).join(' · '),
    // Source line: "מקור: <outlet>, <d.m>" or "מקורות: <a> · <b>"; a person's statement reads "<person> ב<outlet>".
    sourcesLabel: (n) => (n === 1 ? 'מקור:' : 'מקורות:'),
    personIn: (person) => `${person} ב`,
    // 2026-10-31 -> 31.10
    shortDate: (iso) => iso.split('-').slice(1).reverse().map(Number).join('.'),
  },

  builder: {
    yours: 'הקואליציה שלכם',
    empty: 'עדיין לא נבחרו מפלגות',
    add: 'הוסיפו שותפה',
    clear: 'נקו הכול',
    base: 'בסיס',
    setBase: (n) => `קבעו את ${n} כבסיס`,
    unsetBase: (n) => `בטלו את ${n} כבסיס`,
    remove: (n) => `הסירו את ${n}`,
    addParty: (n) => `הוסיפו את ${n}`,
    outside: 'מבחוץ',
    borderline: 'על הסף',
    seatsChip: (n) => `${n} מנ׳`,
    title: 'בנו קואליציה',
    pick: 'בחרו מפלגות',
    baseTag: '★ בסיס',
    hint: 'לכל מפלגה שבחרתם יש תפקיד: בקואליציה (יושבת בממשלה), תומכת (תומכת בממשלה מבחוץ) או נמנעת (בהצבעת האמון). מפלגה שלא נבחרה נחשבת מתנגדת. ההתנגשויות נבדקות בין חברות הקואליציה, והפערים של תומכות ונמנעות מוצגים בנפרד. בסיס להשוואה בוחרים בתוצאות.',
    roles: { member: 'בקואליציה', supporter: 'תומכת', abstainer: 'נמנעת' },
    roleGroup: (n) => `${n}: תפקיד`,
    roleAnnounce: (n, role) => `${n}: ${role}`,
    rowLabel: (n) => n,
    ownMissing: (n) => `?${n}`,
    ownMissingLabel: (n) => `אין עמדה מוצהרת ${inTopics(n)}`,
    impactLabel: (a, c, u) => `ביחס לקואליציה הנוכחית: ${topicsN(a)} בהסכמה או בפער קל, ${c} בסתירה חזיתית, ${u} בלי עמדה מוצהרת`,
    impactHeading: 'ביחס לקואליציה הנוכחית',
    impactAgree: 'הסכמה או פער קל',
    impactClash: 'סתירה חזיתית',
    impactUnknown: 'בלי עמדה',
    clashChipLabel: (n) => `הוספתה תיצור סתירה חזיתית ${inTopics(n)}`,
    coverage: (n) => `עמדות: ${n} מתוך 8`,
    jointListNote: (letters) => `רצו ברשימה משותפת (${letters})`,
    linkedNote: (a, b) => `${a} ו${b} רצו ברשימה משותפת והודיעו שיתפצלו וינהלו משא ומתן בנפרד.`,
  },

  seats: {
    counter: (n) => `כ-${n} מנדטים מתוך 61`,
    missing: (n) => `חסרים ${n} ל-61`,
    reached: 'יש רוב של 61',
    withOutside: (inside, out) => `כ-${inside} בקואליציה, ועוד ${out} מבחוץ`,
    total: (n) => `(סה״כ כ-${n})`,
    borderlineNote: (n) => `כולל ${n} של מפלגה על הסף, ייתכן 0`,
    unityMissing: (n) => `חסרים לכם ${n} מנדטים ל-61`,
    unit: 'מנדטים',
    boxTitle: 'מנדטים',
    empty: 'בחרו מפלגות כדי לראות כמה מנדטים יש להן ביחד.',
    // exact=true in results mode (official seats), else poll averages shown as "≈".
    num: (n, exact) => `${exact ? '' : '≈'}${n}`,
    vote: (f, a, z) => `בעד ${f} · נגד ${a} · נמנעות ${z}`,
    approved: 'הממשלה הייתה זוכה באמון (בעד > נגד)',
    rejected: 'הממשלה לא הייתה זוכה באמון',
    membersLine: (n, missing) => (missing ? `חברות הקואליציה לבדן: ${n} מתוך 61 · חסרים ${missing}` : `חברות הקואליציה לבדן: ${n} · רוב של 61`),
    meterLabel: (n) => `חברות הקואליציה: ${n} מתוך 61`,
    // Parties a result depends on (#13). Numbers come formatted (≈ in polls mode); members is null unless the 61 breaks.
    // A removed party votes against; an abstainer is shown as voting against.
    pivotalIntro: (majority) => `מפלגות שבלעדיהן ${majority ? 'אין לחברות הקואליציה 61, או ש' : ''}אין רוב בהצבעת האמון (בעד מול נגד):`,
    pivotalRow: (name, role, members, f, a) => (role === 'abstainer' ? `אם ${name} תצביע נגד: ${f} מול ${a}`
      : `בלי ${name}${role === 'supporter' ? ' (תומכת מבחוץ)' : ''}: ${members != null ? `חברות הקואליציה ${members} מתוך 61 · ` : ''}${f} מול ${a}`),
    pivotalNone: 'אין מפלגה אחת כזו.',
    majority: 'יש רוב',
    short: (n) => `חסרים ${n}`,
    outsideBit: (n) => `+ ${n} מבחוץ`,
    // Required wording when earlier polls are republished during the restricted period (gov.il elections guide, section 16ה(ח)).
    pollLegal: (d) => `ממוצע סקרים שפורסמו עד ${d}. הסקרים אינם עדכניים, ואין ללמוד מהם על דפוסי הצבעה או עמדות הציבור כיום.`,
    sourceInfo: 'מקור',
    infoTitle: 'מקור מספרי המנדטים',
    infoBody: 'מספרי המנדטים הם ממוצע חמשת הסקרים האחרונים של כל מפלגה, כפי שמופיע בבקלפי, ומוצגים רק כדי להראות סדר גודל. זו אינה תחזית.',
    infoSource: 'בקלפי: סקרים וממוצעים',
    infoGuidance: 'הנחיית הבחירות (gov.il) על פרסום חוזר של סקרים',
  },

  // Results mode (meta.mode = 'results').
  elected: {
    positionsAsOf: 'העמדות: לפי ערב הבחירות (27.10)',
    sourceLink: 'התוצאות באתר ועדת הבחירות',
    belowTitle: 'לא עברו את אחוז החסימה',
    belowHint: 'אפשר לראות את העמדות שלהן, אבל לא לבחור אותן לקואליציה.',
    belowPct: (pct) => `${pct}% מהקולות`,
    viewPositions: (n) => `העמדות של ${n}`,
    // Segments: each one stays whole on screen, and lines break only between them (joined by " · ").
    partyResult: (seats, pct, votes, joint) => [`${seats} מנדטים${joint ? ' (חלק מהרשימה המשותפת)' : ''}`, `${pct}% מהקולות`, `${votes} קולות${joint ? ' לרשימה' : ''}`],
    partyBelow: (pct, threshold) => `לא עברה את אחוז החסימה: ${pct}% מהקולות (הסף ${threshold}%).`,
    resultsTitle: 'תוצאות הבחירות',
    vsTitle: (d) => `ממוצע סקרים (${d.slice(0, 5)}) מול תוצאות`,
    vsSplitNote: '* ממוצע הרשימה המשותפת (כ-7), בחלוקה שלנו לפי מיקומי זהות ברשימה.',
    vsCols: (d) => ['מפלגה', `ממוצע סקרים שפורסמו עד ${d}`, 'מנדטים בתוצאות'],
    resultsText: 'מספרי המנדטים הם התוצאות שפרסמה ועדת הבחירות המרכזית, כפי שפורסמו. הם לא מחושבים מחדש מאחוזי ההצבעה, כי הסכמי עודפים משנים את החלוקה.',
  },

  levels: {
    AGREE: { label: 'מסכימות', icon: '✓' },
    MINOR: { label: 'פער קל', icon: '≈' },
    MAJOR: { label: 'פער מהותי', icon: '≠' },
    CLASH: { label: 'סתירה חזיתית', icon: '✕' },
    NONE: { label: 'אין עמדה מוצהרת', icon: '–' },
    NODATA: { label: 'אין מספיק עמדות', icon: '–' },
  },
  redLine: 'קו אדום',
  componentsDisagree: 'חלוקים בתוך הרשימה',
  componentsIcon: '◐',
  componentsNote: (names) => `רשימה משותפת של ${names}. כשהמרכיבים חלוקים בנושא, התא מסומן ◐ והתקציר מפרט את עמדת כל אחד.`,
  // Hebrew "to X" prefix: ל + name, dropping a leading ה (הליכוד → לליכוד).
  toParty: (name) => (name.startsWith('ה') ? `ל${name.slice(1)}` : `ל${name}`),

  results: {
    pickOne: 'בחרו מפלגה אחת לפחות, או תרחיש מוכן.',
    summaryTitle: 'תמונת מצב',
    // The snapshot title with 2+ members: everything up to the outside block is between the members only.
    summaryTitleScoped: (n) => `תמונת מצב בין ${n === 2 ? 'שתי' : n} חברות הקואליציה`,
    // Before the counts, only when there are parties outside the coalition.
    breakdownLabel: 'נושאים בין חברות הקואליציה:',
    addPartner: 'הוסיפו שותפה כדי לראות התנגשויות',
    crisesTitle: (n) => n === 1 ? 'המשבר שמחכה לקואליציה הזו' : `${n} המשברים שמחכים לקואליציה הזו`,
    gapsTitle: 'הנושאים עם הפערים הגדולים ביותר',
    pairsTag: (label, n) => `${label} · ${plural(n, 'זוג מפלגות אחד', 'זוגות מפלגות')}`,
    expand: 'הצגת כל זוגות המפלגות בנושא',
    collapse: 'הסתרת זוגות המפלגות',
    pairsInTopic: (n, levelIn) => `${plural(n, 'זוג מפלגות אחד', 'זוגות מפלגות')} ${levelIn}`,
    levelIn: { CLASH: 'בסתירה חזיתית', MAJOR: 'בפער מהותי', MINOR: 'בפער קל', AGREE: 'בהסכמה' },
    noCrises: 'אין פערים מהותיים בין השותפות',
    morePairs: (n) => `ועוד ${plural(n, 'זוג מפלגות אחד', 'זוגות מפלגות')}`,
    glueTitle: 'מה מאחד אותה',
    noGlue: 'אין נושא שכל השותפות מסכימות עליו',
    noAgree: 'אין נושא שכל השותפות מסכימות עליו',
    minorOnly: (names) => `פער קל בלבד: ${names}`,
    // The results header: one line when every party is a member, two labelled groups otherwise.
    coalitionLabel: 'הקואליציה שנבדקת',
    membersLabel: (n) => `בקואליציה (${n})`,
    outsideLabel: 'מחוץ לקואליציה',
    outsideParty: (name, role) => `${name} · ${role}`,
    noMembers: 'סמנו לפחות מפלגה אחת כ״בקואליציה״ כדי לראות התנגשויות.',
    peripheryTitle: 'איפה התומכות והנמנעות רחוקות מהקואליציה',
    peripheryIntro: 'לכל תומכת ונמנעת: הנושאים שבהם יש לה פער מהותי או סתירה חזיתית מול חברה בקואליציה, והחברה הרחוקה ממנה ביותר. הפערים האלה לא נספרים בתמונת המצב שלמעלה.',
    peripheryNone: 'אין נושא עם פער מהותי או סתירה חזיתית מול חברות הקואליציה.',
    roleName: { supporter: 'תומכת מבחוץ', abstainer: 'נמנעת' },
    versus: (n) => `מול ${n}`,
    // Red lines crossed among the members (#14): one line in the snapshot, also shown when there are none.
    redLinesCrossed: (n, list) => `${n === 1 ? 'קו אדום אחד נחצה' : `${n} קווים אדומים נחצו`} בין חברות הקואליציה: ${list}`,
    noRedLinesCrossed: 'אין קו אדום שנחצה בין חברות הקואליציה',
    // The snapshot's outside block: its heading, and the link to the supporters/abstainers card.
    outsideHeading: 'מול המפלגות מחוץ לקואליציה',
    peripheryLink: (n) => `↓ ${clashesN(n)} עם חברות הקואליציה`,
    glueCoverage: (k, n) => `(${k} מתוך ${n} שותפות הביעו עמדה)`,
    frictionTitle: 'השותפה שמייצרת הכי הרבה חיכוך',
    frictionTie: 'השותפות שמייצרות הכי הרבה חיכוך',
    whatIfRemove: 'מה אם נוריד אותה?',
    // delta: { kind: 'clash' | 'major', before, after } or null when nothing changes.
    withoutPreview: (delta, seats, exact) => {
      const parts = [];
      if (delta) {
        const what = delta.kind === 'clash' ? 'בסתירה חזיתית' : 'בפער מהותי';
        parts.push(delta.after === 0 ? `אין נושא ${what} במקום ${delta.before}` : `${topicsN(delta.after)} ${what} במקום ${delta.before}`);
      }
      if (seats != null) parts.push(`${exact ? '' : 'כ-'}${seats} מנדטים`);
      return parts.length ? `בלעדיה: ${parts.join(' · ')}` : '';
    },
    // The inline undo line at the top of the results view (#29): what changed, "החזירו את הקודמת", and a close button.
    undoReplaced: 'הקואליציה הוחלפה',
    undoAdded: (names) => (names.length === 1 ? `נוספה: ${names[0]}` : `נוספו: ${names.join(', ')}`),
    undoRemoved: (n) => `הוסרה: ${n}`,
    undo: 'החזירו את הקודמת',
    undoClose: 'סגרו את ההודעה',
    // Announced after undo; outside parties mirror the header's groups ("C (תומכת מבחוץ)").
    restored: (members, outside) => {
      const out = outside.length ? `מחוץ לקואליציה: ${outside.join(', ')}` : '';
      if (!members.length) return `הקואליציה הקודמת שוחזרה · ${out}`;
      return `הקואליציה הקודמת שוחזרה: ${members.join(' + ')}${out ? ` · ${out}` : ''}`;
    },
    overall: (x, y) => `${x} מתוך ${topicsN(y)} ללא סתירה חזיתית`,
    // [text, css class, always shown]; zero counts are hidden except head-on clashes and no data.
    breakdown: (a, mi, m, c, w) => [
      [`${topicsN(a)} בהסכמה`, 'bd-ok', false],
      [`${mi} בפער קל`, 'bd-minor', false],
      [`${m} בפער מהותי`, 'bd-major', false],
      [`${c} בסתירה חזיתית`, 'bd-clash', true],
      [`${w} בלי נתונים`, 'bd-none', true],
    ],
    resultsEmpty: 'עדיין לא בחרתם מפלגות.',
    resultsEmptyLink: 'לבחירת מפלגות',
    noData: 'אין נתונים',
    coverageLine: (toName, n) => `* ${toName} אין עמדה מוצהרת ב-${n} מתוך 8 הנושאים.`,
    coverageTail: 'נושאים בלי עמדה לא נספרים, ולכן ייתכן שהקואליציה נראית הרמונית יותר משהיא באמת.',
    live: (name, n) => `${name}: ${topicsN(n)} בסתירה חזיתית בקואליציה`,
  },

  completions: {
    title: 'מה חסר לרוב של 61 חברות קואליציה?',
    note: 'תומכות ונמנעות לא נספרות כאן. הן משפיעות רק על הצבעת האמון.',
    intro: (have) => `לחברות הקואליציה יש ${have} מנדטים. אלה הצירופים הקטנים ביותר של מפלגות נוספות שמביאים אותן ל-61: אם מורידים מצירוף מפלגה אחת, הוא כבר לא מגיע. הסדר: קודם צירופים עם הכי מעט מפלגות, ואז לפי מספר המנדטים שנוספים. זו לא המלצה. לחיצה מוסיפה את המפלגות לקואליציה.`,
    currentRedLines: (n, list) => `הקואליציה הנוכחית כבר חוצה ${n === 1 ? 'קו אדום אחד' : `${n} קווים אדומים`}: ${list}`,
    seats: (added, total) => `+${added} מנדטים (סה״כ ${total})`,
    // Head-on clash topics in the resulting coalition, and how many of them the addition creates.
    clashes: (n, fresh) => (n === 0 ? 'אין נושא בסתירה חזיתית'
      : `${topicsN(n)} בסתירה חזיתית (${fresh === 0 ? 'אין חדשים' : fresh === 1 ? 'אחד חדש' : `${fresh} חדשים`})`),
    newRedLines: (n, list) => `${n === 1 ? 'קו אדום חדש' : `${n} קווים אדומים חדשים`}: ${list}`,
    noNewRedLines: 'אין קווים אדומים חדשים',
    nowRole: { supporter: '(כיום תומכת)', abstainer: '(כיום נמנעת)' },
    aria: (names, meta, red) => `הוספת ${names}: ${meta}, ${red}`,
    showAll: (n) => `הציגו את כל ${n}`,
    showFewer: 'הציגו פחות',
    none: 'אין צירוף של המפלגות הנותרות שמביא את חברות הקואליציה ל-61.',
    applied: (names) => `נוספו לקואליציה: ${names}`,
  },

  // "הקואליציות הקרובות לעמדות של X" (#22, results mode): from the party sheet or the build view. Never "best".
  closest: {
    button: (x) => `הקואליציות הקרובות לעמדות של ${x}`,
    title: (x) => `הקואליציות הקרובות לעמדות של ${x}`,
    back: (x) => `חזרה לכרטיס של ${x}`,
    intro: (x) => `הסדר: קווים אדומים · סתירות עם ${x} · סתירות בקואליציה כולה · הסכמה · מנדטים. זו לא המלצה.`,
    howLink: 'איך זה מחושב?',
    ownCoverage: (toX, n) => `${toX} עמדה מוצהרת ב-${n} מתוך 8 נושאים, ורק הם מושווים.`,
    noRedLines: (toX) => `${toX} אין קו אדום מוצהר.`,
    agree: (n) => `${topicsN(n)} בהסכמה או בפער קל`,
    xClash: (n, x) => `${n} בסתירה חזיתית עם ${x}`,
    wholeClash: (n) => `${n} בסתירה חזיתית בקואליציה כולה`,
    redLines: (n, list) => (n === 0 ? 'אף קו אדום שלה לא נחצה' : `${n === 1 ? 'קו אדום אחד שלה נחצה' : `${n} קווים אדומים שלה נחצים`}: ${list}`),
    seats: (n) => `${n} מנדטים`,
    // Partners without a position on 3+ topics; the first names the scale, the rest give the count only.
    warn: (list) => `מעט עמדות מוצהרות: ${list}`,
    warnItem: (name, missing, first) => (first ? `${name} (אין עמדה ב-${missing} מתוך 8)` : `${name} (${missing})`),
    orList: (names) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} או ${names.at(-1)}`),
    showPartial: (n, list) => (n === 1 ? `הציגו גם קואליציה אחת שכוללת את ${list}` : `הציגו גם ${n} קואליציות שכוללות את ${list}`),
    hidePartial: (list) => `הסתירו את הקואליציות שכוללות את ${list}`,
    onlyPartial: (list) => `כל הקואליציות האלה כוללות את ${list}`,
    partialNote: 'למפלגות האלה אין עמדה מוצהרת בחלק מהנושאים, ולכן ההשוואה איתן חלקית והמספרים עשויים להיות נמוכים מהמציאות. למשל, קו אדום לא נספר כשאין עמדה בנושא.',
    none: 'אין קואליציה מינימלית של 61 מנדטים שכוללת את המפלגה הזאת.',
    aria: (partners, meta) => `בחירת הקואליציה ${partners}: ${meta}`,
    applied: (names) => `נבחרה קואליציה: ${names}`,
    pickerChoose: 'בחרו מפלגה',
  },

  matrix: {
    title: 'מפת העמדות',
    reference: '● נקודת ייחוס',
    relBase: (n) => `הצבע = הפער מול ${n} (הבסיס)`,
    relWorst: 'הצבע = ההתנגשות החמורה ביותר של המפלגה בנושא מול שותפה כלשהי',
    baseHint: 'בחרו מפלגה כדי לראות את ההתאמה של כולן ממנה.',
    colorBy: 'צבע לפי:',
    colorByAll: 'הכל',
    colorByAllHint: 'הכל: הצבע מראה את ההתנגשות החמורה ביותר מול שותפה כלשהי',
    baseNull: 'לבסיס אין עמדה',
    cellLabel: (party, topic, level, ref) => ref
      ? `${party}, ${topic}: ${level} מול ${ref}`
      : `${party}, ${topic}: ${level}`,
  },

  sheet: {
    siteTranslation: '(תרגום חופשי של האתר)',
    translationBy: (n) => `(תרגום: ${n})`,
    close: 'סגירה',
    source: 'מקור',
    extraSource: 'מקור נוסף',
    via: 'דרך בקלפי',
    sourceTypes: { platform: 'מצע', statement: 'הצהרה', record: 'רקורד חקיקתי' },
    // A year alone: an older platform whose exact date is not known.
    date: (d) => (/^\d{4}$/.test(d) ? `משנת ${d}` : `מתאריך ${d}`),
    why: 'למה בצבע הזה?',
    noPosition: 'לא מצאנו עמדה מוצהרת של המפלגה בנושא הזה במקור שעומד בכללים שלנו.',
    gap: (a, b, d, la, lb) => `${a} ↔ ${b}: ${d} דרגות (${la} ↔ ${lb})`,
    gapRed: (a, b, d, red) => `${a} ↔ ${b}: ${d} דרגות, ו${red} הצהירה שזה קו אדום שלה`,
    officialName: 'שם הרשימה הרשמי',
    archive: 'עותק בארכיון',
    correction: 'מצאתם טעות בעמדה הזו?',
    correctionBody: 'הקישור לעמוד:',
    correctionSubject: (party, topic) => `תיקון: ${party} · ${topic}`,
    refExplain: 'זו מפלגת הבסיס. שאר העמודה נצבעת לפי המרחק ממנה.',
    noneExplain: 'לאחת המפלגות אין עמדה מוצהרת בנושא, ולכן אין השוואה. התא לא נספר בתוצאות.',
    agree: (a, b) => `${a} ו${b} באותה נקודה בסולם.`,
    gapTitle: (a, b, d) => `${a} ↔ ${b}: פער של ${d === 1 ? 'דרגה אחת' : `${d} דרגות`}`,
    // In an expanded pair row there is no matrix cell, so only the first sentence of noneExplain.
    noneExplainPair: 'לאחת המפלגות אין עמדה מוצהרת בנושא, ולכן אין השוואה.',
    redByLine: (party) => `${party} הצהירה שהנושא הוא קו אדום שלה, ולכן פער של 2 דרגות נחשב סתירה חזיתית.`,
    axisTitle: 'הסולם בנושא הזה',
    noPositionLabel: 'אין עמדה מוצהרת',
    partyProfile: 'כל העמדות',
    nobodyHere: 'אין',
  },

  pair: {
    title: 'השוואת זוג',
    compareWith: 'השוו עם…',
    choose: 'בחרו מפלגה להשוואה',
    viewTitle: 'השוואה בין שתי מפלגות',
    intro: (n) => `העמדות המוצהרות של שתי מפלגות זו לצד זו, ב-${topicsN(n)}, עם מקור לכל עמדה. זו לא המלצה ולא תחזית.`,
    pickA: 'מפלגה ראשונה',
    pickB: 'מפלגה שנייה',
    pickBoth: 'בחרו שתי מפלגות כדי לראות את העמדות שלהן בכל נושא.',
    // summary: pair.summary(...) for the two parties, all four levels.
    shareText: (a, b, summary) => `השוואת עמדות: ${a} ↔ ${b} · ${summary}`,
    summary: (agree, minor, major, clash, n) =>
      `מסכימות ב-${agree}, פער קל ב-${minor}, פער מהותי ב-${major}, סתירה חזיתית ב-${clash}, מתוך ${topicsN(n)}`,
  },

  share: {
    button: 'שתפו',
    copied: 'הקישור הועתק',
    whatsapp: 'שלחו בוואטסאפ',
    // names: the members. outside: [name, role] of the supporters and abstainers, with periphery = their head-on clashes
    // with the members; without outside parties the text is unchanged.
    text: (names, clashes, periphery = null, outside = []) => (outside.length
      ? `הקואליציה שבניתי: ${names} · מחוץ לקואליציה: ${outside.map(([n, r]) => `${n} (${r})`).join(', ')} · ${topicsN(clashes)} בסתירה חזיתית בין חברות הקואליציה · ${clashesN(periphery)} עם המפלגות מחוץ לקואליציה`
      : `הקואליציה שבניתי: ${names} · ${topicsN(clashes)} בסתירה חזיתית`),
  },

  method: {
    title: 'מתודולוגיה, מקורות והבהרות',
    // On a translation only: what was translated and how it was checked (the Hebrew is the original).
    translationTitle: '',
    translation: '',
    colorRule: 'אדום = המפלגות רחוקות 3 דרגות או יותר בסולם, או 2 דרגות כשאחת מהן הצהירה שזה קו אדום שלה.',
    disclaimer: 'זה לא המלצת הצבעה.',
    independent: 'האתר עצמאי ואינו קשור לבקלפי או לאף מפלגה.',
    names: 'שמות הרשימות לפי פרסום ועדת הבחירות המרכזית.',
    intro: (n) => `לכל אחת מ-${n} המפלגות קבענו מיקום בסולם של 5 נקודות בכל אחד מ-8 נושאים, לפי מה שהמפלגה עצמה אמרה או כתבה. ההתאמה בין מפלגות מחושבת אוטומטית מהמרחק בסולם, בלי שיפוט ידני של זוגות.`,
    levelsTitle: 'איך נקבע הצבע',
    levelRules: [
      ['AGREE', 'אותה נקודה בסולם'],
      ['MINOR', 'דרגה אחת'],
      ['MAJOR', 'שתי דרגות'],
      ['CLASH', '3 דרגות או יותר, או 2 דרגות כשאחת המפלגות הצהירה שזה קו אדום שלה'],
      ['NONE', 'לאחת המפלגות אין עמדה מוצהרת, ולכן לא נספר'],
    ],
    impactRule: 'בבחירת מפלגות: ליד כל מפלגה שעוד לא נבחרה מופיעים שלושה מספרים ביחס לקואליציה הנוכחית. בכל נושא נבדק הפער הגדול ביותר של המפלגה מול החברות הנוכחיות: ✓ = הסכמה או פער קל (בסיכום התוצאות הם נספרים בנפרד), ✕ = סתירה חזיתית, ? = אין עמדה מוצהרת (של המפלגה, או של כל החברות הנוכחיות). פער מהותי אינו נספר באף אחד מהם. המספרים הם מידע בלבד: הם לא משנים את סדר המפלגות ואינם המלצה.',
    breakdownRule: 'בתוצאות: נושא נספר "בהסכמה" כשכל חברות הקואליציה שהביעו עמדה באותה נקודה, "בפער קל" כשהפער הגדול ביותר בו הוא דרגה אחת, "בפער מהותי" כשהוא פער מהותי, "בסתירה חזיתית" כשיש בו סתירה חזיתית, ו"בלי נתונים" כשלפחות לשתי חברות אין עמדה מוצהרת. אין ציון כולל.',
    pairRule: 'בהשוואה בין שתי מפלגות מוצגים כל הנושאים בסדר הקבוע שלהם, עם אותן דרגות פער כמו בשאר האתר. נושא שלאחת המפלגות אין בו עמדה מוצהרת מסומן ״אין עמדה מוצהרת״ ולא נספר בסיכום.',
    closestTitle: 'הקואליציות הקרובות לעמדות של מפלגה',
    // The rule, as lists (#32); checked against closestTo() and completions(). order: [step, note under it or ''].
    closestRule: {
      intro: 'בוחרים מפלגה, ורואים קואליציות של רוב שהיא חלק מהן.',
      includedTitle: 'אילו קואליציות נכללות',
      included: [
        'רק מפלגות שעברו את אחוז החסימה, גם המפלגה וגם השותפות.',
        'רק קואליציות מינימליות: המפלגה ושותפות שיחד יש להן לפחות 61 מנדטים, וכל אחת מהשותפות נחוצה לרוב.',
        'תומכות ונמנעות לא נספרות.',
        'קואליציה שיש בה שותפה בלי עמדה ב-3 נושאים או יותר מוצגת ברשימה נפרדת ומקופלת (פתוחה כשאין קואליציות אחרות), עם אזהרה: ההשוואה איתה חלקית, והמספרים עשויים להיות נמוכים מהמציאות.',
      ],
      orderTitle: 'סדר הרשימה (זהה בשתי הרשימות, בלי משקלות ובלי ציון כולל)',
      order: [
        ['פחות קווים אדומים של המפלגה שנחצים.', ''],
        ['פחות נושאים שבהם היא בסתירה חזיתית עם שותפה.', ''],
        ['פחות נושאים בסתירה חזיתית בקואליציה כולה.', ''],
        ['יותר נושאים שבהם היא מסכימה או בפער קל עם כל השותפות שיש להן עמדה בנושא.', 'נושא נספר רק אם למפלגה ולפחות לשותפה אחת יש בו עמדה.'],
        ['יותר מנדטים.', ''],
      ],
      after: ['בתיקו מלא: פחות שותפות, ואז סדר המפלגות.', 'נושא בלי עמדה מוצהרת לא נספר.', 'זו לא המלצה ולא תחזית.'],
    },
    matrixRule: 'במפה: ב״צבע לפי״ אפשר לבחור מפלגת בסיס, ואז כל תא נצבע לפי הפער מהבסיס. בלי בסיס, כל תא מראה את ההתנגשות החמורה ביותר של המפלגה בנושא מול שותפה כלשהי.',
    resultsRule: (seats) => `המשברים: הנושאים עם הפער החמור ביותר, לפי חומרה, מרחק${seats ? ', קו אדום ואז סך המנדטים של הזוג' : ' וקו אדום'}. השותפה שמייצרת הכי הרבה חיכוך: 3 נקודות על כל סתירה חזיתית ונקודה על כל פער מהותי מול שאר השותפות (מפלגת הבסיס לא נספרת). מפלגה עם פחות עמדות מוצהרות צוברת פחות נקודות.`,
    axesTitle: 'הסולמות',
    sourcesTitle: 'מקורות',
    sourceRules: [
      ['platform', 'מצע: מצע הבחירות או תוכנית שהמפלגה פרסמה.'],
      ['statement', 'הצהרה: דברי המפלגה או מנהיגיה בלשונם: אתר, חשבון רשמי, ריאיון מוקלט או ציטוט ישיר. תיאור של עיתונאי אינו מקור.'],
      ['record', 'רקורד חקיקתי: הצעת חוק שהמפלגה עצמה יזמה או קידמה. תכננו לכלול גם הצבעות שבהן מפלגה חרגה מהקו של הגוש שלה, אבל בפועל אף עמדה לא נשענת על הצבעה. הצבעה רגילה במשמעת קואליציונית אינה ראיה לעמדה.'],
    ],
    corrections: 'מצאתם טעות? כתבו לנו ונתקן.',
    researchDocs: 'נימוקי המיקום והחלטות הבדיקה',
    researchDocsNote: 'לכל עמדה יש תיעוד של הראיות ושל החלטות הבדיקה, כולל קווי אדום ושיקולים שעלו.',
    redLineRule: 'קו אדום מסומן רק כשהמפלגה או מנהיגה אמרו במפורש, בלשונם ובפומבי, שהנושא הוא תנאי לכניסה לקואליציה. לא מדיווחים בתקשורת.',
    redLineTest: 'מבחן הניסוח: נדרשת אמירה שבלי X המפלגה לא תיכנס לממשלה או לא תתמוך בה ("לא נהיה שותפים בשום ממשלה ש…", "תנאי סף"), או ש-X אינו נתון למשא ומתן ("שום ויתור", "לא נוותר"). סדר עדיפויות ("בראש הדרישות שלנו") אינו קו אדום. הבדיקה לפי הניסוח בלבד, בלי קשר לגוש.',
    redLinesCrossedRule: 'בתמונת המצב מופיעה שורה אחת על קווים אדומים: קו אדום של חברה בקואליציה נחצה כשחברה אחרת רחוקה ממנה 2 דרגות או יותר באותו נושא (אותו כלל שהופך פער של 2 דרגות לסתירה חזיתית). נספרים רק קווים אדומים מוצהרים, ונושא בלי עמדה מוצהרת לא נספר. כשאין קו אדום שנחצה, השורה אומרת זאת. זו אותה רשימה שמופיעה בכרטיס "מה חסר לרוב". השורה הזו בודקת רק את חברות הקואליציה. קווים אדומים של התומכות והנמנעות לא נבדקים בה. בכרטיס שלהן, 🚩 מסמן פער של 2 דרגות שנחשב סתירה חזיתית בגלל קו אדום.',
    rolesTitle: 'תפקידים והצבעת אמון',
    // With seats hidden (polls mode, showSeats off) the vote is not shown, so its rules are left out.
    // linked: polls mode, where the parties of one list count as one unit in the completions.
    rolesRules: (seats, linked) => [
      'לכל מפלגה אחד מארבעה תפקידים: בקואליציה, תומכת מבחוץ, נמנעת, או מתנגדת. מתנגדת היא ברירת המחדל לכל מפלגה שלא נבחרה.',
      'המשברים, מה שמאחד, החיכוך ומפת העמדות נבדקים רק בין חברות הקואליציה. הפערים של תומכות ונמנעות מול חברות הקואליציה מוצגים בכרטיס נפרד.',
      ...(seats ? [
        'הצבעת האמון: בעד = המנדטים של חברות הקואליציה ושל התומכות. נמנעות = המנדטים של הנמנעות. נגד = כל השאר, בהנחה שכל מפלגה שלא סומנה מצביעה נגד. הממשלה זוכה באמון כשיש יותר קולות בעד מאשר נגד (רוב המצביעים).',
        'בנפרד מוצג אם לחברות הקואליציה לבדן יש 61 מנדטים.',
        'מתחת להצבעה מופיעות המפלגות שהתוצאה תלויה בכל אחת מהן לבדה: חברה שבלעדיה לחברות הקואליציה כבר אין 61, וחברה או תומכת שבלעדיה אין רוב בהצבעת האמון (בעד לא גדול מנגד, כולל תיקו). מפלגה שיוצאת נספרת כמתנגדת, כמו כל מפלגה שלא נבחרה. נמנעת נבדקת כאילו הצביעה נגד. לכל מפלגה מוצגים המספרים בלעדיה (בעד מול נגד, ומספר המנדטים של חברות הקואליציה כשהם יורדים מתחת ל-61). המפלגות מוצגות לפי תפקיד ואז לפי סדר המפלגות, בלי דירוג. כשהממשלה לא זוכה באמון, הרשימה לא מוצגת.',
        'לא מחושבים: מעבר של חברי כנסת בודדים בין עמדות, היעדרויות, והצבעה של חברי כנסת שלא לפי עמדת הסיעה.',
        `מה חסר לרוב של 61: הצירופים הקטנים ביותר של מפלגות שאינן חברות בקואליציה (כולל תומכות ונמנעות) שמביאים את חברות הקואליציה לבדן ל-61 מנדטים לפחות. צירוף נחשב "קטן ביותר" כשהורדת כל אחת מהמפלגות בו משאירה את הקואליציה מתחת ל-61. ${linked ? 'הציונות הדתית וזהות, שרצו ברשימה אחת, נספרות כיחידה אחת כשאף אחת מהן לא בקואליציה. ' : ''}הסדר: קודם צירופים עם הכי מעט רשימות, אחר כך לפי מספר המנדטים שנוספים, ואחר כך סדר המפלגות. מוצגים 6, ואפשר להציג את כולם. לכל צירוף מוצגים מספר הנושאים בסתירה חזיתית בקואליציה שתתקבל וכמה מהם חדשים, ורק הקווים האדומים שהצירוף חוצה לראשונה. קווים אדומים שהקואליציה הנוכחית כבר חוצה מוצגים פעם אחת מעל הרשימה. זה מידע, לא המלצה.`,
      ] : []),
    ],
    jointTitle: 'רשימות משותפות',
    // Results mode: replaces jointRules[0] (the two are chosen independently after the election).
    jointResults: 'רשימות שהודיעו שיתפצלו לאחר הבחירות מוצגות כמפלגות נפרדות. הציונות הדתית וזהות רצו ברשימה אחת (ט), אבל הודיעו שהחיבור ביניהן "טכני" ושאחרי הבחירות יתפצלו וינהלו את המשא ומתן הקואליציוני בנפרד. אחרי הבחירות בוחרים כל אחת מהן בנפרד, וגם בחישוב "מה חסר לרוב" כל אחת נספרת לבד.',
    jointRules: [
      'רשימות שהודיעו שיתפצלו לאחר הבחירות מוצגות כמפלגות נפרדות. הציונות הדתית וזהות רצו ברשימה אחת (ט), אבל הודיעו שהחיבור ביניהן "טכני" ושאחרי הבחירות יתפצלו וינהלו את המשא ומתן הקואליציוני בנפרד. כשבוחרים אחת מהן, השנייה מתווספת אוטומטית, ואפשר להסיר כל אחת.',
      'רשימות משותפות אחרות מוצגות כרשימה אחת. כשהמרכיבים שלהן מחזיקים בעמדות שונות בבירור בנושא מסוים, התא מסומן ◐ והתקציר מפרט את עמדת כל מרכיב בשמו.',
    ],
    // Shown only while seats are shown (it quotes poll figures).
    jointSeats: 'המנדטים שלהן הם חלוקה של ממוצע הרשימה המשותפת (כ-7) לפי המקומות של זהות ברשימה (2, 8, 10, 11): כ-1 לזהות וכ-6 לציונות הדתית. זו הערכה שלנו, לא תוצאת סקר.',
    jointSource: 'מקור על הפיצול',
    nullRule: 'כשלא מצאנו מקור שעומד בכללים, העמדה מסומנת "אין עמדה מוצהרת". אנחנו לא מנחשים. כשנמצאו דברים של המפלגה שאינם עמדה על הציר (למשל אמירה כללית, או התייחסות לחלק אחר של הנושא), הם מוצגים עם המקור שלהם, אבל העמדה לא ממוקמת ולא נספרת. כשאין עמדה עדכנית, אפשר להציג גם סעיף ממצע רשמי מבחירות קודמות, כהערה עם השנה ועם המקור. הוא אף פעם לא משמש למיקום, והכלל זהה לכל המפלגות.',
    bakalpi: 'נקודת המוצא למחקר הייתה האתר העצמאי בקלפי, שמרכז את עמדות המפלגות. התקצירים נכתבו מחדש, וכל עמדה מקושרת למקור הראשוני.',
    sourceMixTitle: 'סוגי מקורות לפי גוש',
    sourceMixIntro: 'לא לכל המפלגות יש מצע לבחירות 2026, ולכן סוג המקור משתנה בין מפלגות וגושים. הטבלה מראה כמה מהעמדות שנקבעו נשענות על כל סוג מקור, וכמה נושאים נותרו בלי עמדה. החלוקה לגושים לפי בקלפי (חדשות 12).',
    sourceMixCols: ['גוש', 'מצע', 'הצהרה', 'רקורד', 'אין עמדה'],
    blocNames: { coalition: 'גוש הקואליציה', opposition: 'גוש האופוזיציה', arab: 'מפלגות ערביות', none: 'לא משויכות לגוש' },
    undatedNote: 'מקורות שאין עליהם תאריך מוצגים בלי תאריך.',
    coverageTitle: 'כיסוי הנתונים',
    coverageCols: ['מפלגה', 'עמדות', 'אין עמדה', 'קווים אדומים', 'מצע 2026'],
    platformStatus: { full: 'פורסם', partial: 'חלקי', none: 'לא פורסם' },
    orderTitle: 'סדר והצגה',
    // With seats hidden (election day), nothing here may reveal poll standings.
    // Results mode: seat order, and media scenarios instead of the bloc presets.
    orderRulesResults: [
      'המפלגות מסודרות לפי מספר המנדטים בתוצאות, ובשוויון לפי מספר הקולות. לכל המפלגות אותו צבע.',
      'תרחישים שעלו בתקשורת: עד 4 הרכבים שדווחו בכלי תקשורת או שהציע פרשן, עם מקור ותאריך לכל אחד. שם התרחיש הוא ההרכב עצמו, בלי כינוי. התפקידים (בקואליציה, תומכת, נמנעת) לפי המקור. מפלגה שלא הוזכרה נחשבת מתנגדת. כשמקור מזכיר מפלגה שרצה ברשימה משותפת, נכללת כל הרשימה (למשל הציונות הדתית וזהות). התרחישים מסודרים לפי האלף-בית, והם נקודת מוצא בלבד, לא תחזית.',
      'המספרים של הסולם לא מוצגים, וכיוון הסולם (מי "מימין" ומי "משמאל") אינו בעל משמעות.',
    ],
    // order: 'polls' | 'ballot' (polls mode with seats hidden).
    orderRules: (order, unityPartner) => [
      { polls: 'המפלגות מסודרות לפי ממוצע הסקרים. לכל המפלגות אותו צבע.', ballot: 'המפלגות מסודרות לפי אותיות הפתק, בסדר האלף-בית. לכל המפלגות אותו צבע.' }[order],
      'התרחישים המוכנים מסודרים לפי האלף-בית.',
      'חלוקת הגושים לפי בקלפי וחדשות 12. מפלגות שאינן בגוש לא נכללות באף תרחיש, אבל אפשר להוסיף אותן.',
      { polls: 'אחדות = הליכוד ועוד המפלגה הגדולה ביותר בגוש האופוזיציה לפי ממוצע הסקרים. את השאר בוחרים אתם.', ballot: `אחדות = הליכוד ועוד ${unityPartner} (את השאר בוחרים אתם).` }[order],
      'המספרים של הסולם לא מוצגים, וכיוון הסולם (מי "מימין" ומי "משמאל") אינו בעל משמעות.',
    ],
    examplesTitle: 'דוגמאות מתוך הנתונים',
    exampleBloc: { coalition: 'בתוך גוש הקואליציה', opposition: 'בתוך גוש האופוזיציה' },
    example: (a, b, topic, level) => `${a} ↔ ${b}, ${topic}: ${level}`,
    pollsTitle: 'סקרים',
    pollsText: 'מספרי המנדטים הם ממוצע חמשת הסקרים האחרונים לכל מפלגה, כפי שמופיע בבקלפי. הם מוצגים רק כדי להראות סדר גודל.',
    pollsGuidance: 'תקופת ההגבלה על פרסום סקרים החלה בסוף יום שישי שלפני הבחירות. לפי מדריך הבחירות באתר gov.il (סעיף 16ה(ח) לחוק הבחירות), פרסום חוזר של סקר מוקדם בתקופה זו מותר רק בציון בהבלטה שהסקר אינו עדכני ושאין ללמוד ממנו על דפוסי הצבעה או עמדות הציבור ביום הפרסום. לכן המשפט הזה מופיע בכל מקום שבו מוצגים מנדטים.',
    pollsGuidanceLink: 'מדריך הבחירות (gov.il)',
    updated: (d) => `עדכון אחרון של הנתונים: ${d}`,
  },

  privacy: {
    title: 'פרטיות',
    lines: [
      'אין עוגיות, ואנחנו לא אוספים מידע אישי.',
      'מונה הכניסות (GoatCounter) מקבל רק את נתיב העמוד, הכותרת, רוחב המסך והדומיין שממנו הגעתם, ורק מהאתר עצמו.',
      'שרת האחסון (Netlify) רואה כתובות IP, כמו בכל אתר.',
      'הקואליציה שבוחרים נשמרת רק בכתובת שבדפדפן, אחרי הסימן #, ולכן לא נשלחת לשרת. כשמשתפים קישור, הבחירה מופיעה בו. קישורים בפורמט הישן מומרים אוטומטית.',
    ],
    contact: 'שאלות על פרטיות:',
  },

  a11y: {
    title: 'הצהרת נגישות',
    standard: 'האתר שואף לעמוד בתקן הישראלי ת״י 5568, המבוסס על הנחיות WCAG 2.0 ברמה AA.',
    doneTitle: 'מה עשינו:',
    done: [
      'HTML סמנטי: כותרות, רשימות, טבלאות וכפתורים אמיתיים.',
      'ניווט מלא במקלדת, עם מיקוד גלוי.',
      'תוויות ותפקידי ARIA לתיבות הסימון, לכפתורים, למפה ולחלונות.',
      'צבע תמיד מלווה בסמל או בטקסט, אף פעם לא לבדו.',
      'ניגודיות צבעים ברמת AA.',
      'כתיבה מימין לשמאל בעברית ומשמאל לימין באנגלית, ועיצוב שמותאם קודם כול לטלפון.',
    ],
    limitsTitle: 'מגבלות ידועות:',
    limits: [
      'בטלפון, שמות הנושאים בראש מפת העמדות כתובים באות קטנה.',
      'בבחירת ״צבע לפי״ ובבחירת התפקיד של מפלגה עוברים בין האפשרויות במקש Tab ולא בחיצים.',
      'אחרי בחירה ב״השוו עם…״ המיקוד לא נשאר על הרשימה.',
      'אחרי הסרת מפלגה, ההודעה לקורא המסך מנוסחת כאילו היא עדיין בקואליציה.',
      'בתצוגות הבחירה והתוצאות אין כותרת ראשית (h1).',
    ],
    contact: 'נתקלתם בבעיית נגישות? כתבו לנו ונטפל בהקדם:',
    date: 'ההצהרה עודכנה ב-1.11.2026.',
  },

  why: {
    title: 'למה בניתי את זה',
    p1: 'אני ליעוז, מהנדס תוכנה וחוקר, ועסקתי במחקר בבחירה חברתית חישובית. לפני כל בחירות מדברים על \'גושים\', אבל כמעט אף פעם לא בודקים אם המפלגות שאמורות לשבת יחד מסכימות זו עם זו בכלל. רציתי כלי פשוט שמראה את זה, עם מקור לכל עמדה, ומשאיר את המסקנות לכם. אין לי קשר לאף מפלגה, והכלי לא ממליץ למי להצביע.',
    p2: 'הקוד והנתונים פתוחים בכוונה: כדי שכל אחד יוכל לבדוק את העמדות ואת המקורות, כדי שהכלי יתעדכן לפי התפתחויות, וכדי שישתפר בזכות משוב של משתמשים. מצאתם טעות או מקור טוב יותר?',
    writeMe: 'כתבו לי',
  },

  footer: {
    by: 'נבנה על ידי ליעוז עקירב · Lioz Akirav',
    githubLabel: 'GitHub',
    emailLabel: 'שלחו מייל',
    why: 'למה בניתי את זה',
    how: 'איך זה עובד',
    openData: 'הנתונים והמקורות פתוחים לבדיקה',
    privacy: 'פרטיות',
    a11y: 'הצהרת נגישות',
    notAdvice: 'לא המלצת הצבעה',
  },

  // Quote attribution (links.js): where a quote was published, by source host.
  links: {
    media: {
      'x.com': 'X', 'www.ynet.co.il': 'ynet', 'www.mako.co.il': 'מאקו', 'www.maariv.co.il': 'מעריב', 'www.walla.co.il': 'וואלה',
      'www.i24news.tv': 'i24NEWS', 'www.inn.co.il': 'ערוץ 7', 'www.israelnationalnews.com': 'ערוץ 7', 'www.kipa.co.il': 'כיפה',
      '13tv.co.il': 'חדשות 13', 'www.arab48.com': 'Arab48', 'bokra.net': 'בוקרא', 'www.hakalkalit.org': 'הכלכלית',
      'main.knesset.gov.il': 'הצעת חוק בכנסת',
    },
    platform: 'מצע המפלגה',
    partySite: 'אתר המפלגה',
    translatedBy: (who) => `(תרגום: ${who})`,
  },
};
