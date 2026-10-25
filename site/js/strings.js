// All user-visible UI strings. Functions take the dynamic parts.
export const S = {
  appName: 'מי עם מי',
  tagline: 'בנו קואליציה וגלו איפה היא תתפרק',
  updated: (d) => `עודכן ${d}`,
  stubBanner: 'נתוני דמה לפיתוח בלבד: העמדות אינן אמיתיות',

  how: {
    title: 'איך זה עובד',
    lines: [
      'בחרו מפלגות, או התחילו מתרחיש מוכן ושנו אותו.',
      'לכל מפלגה מיקום ב-8 נושאים, לפי המצע או הצהרות רשמיות, עם מקור.',
      'הצבע מראה את המרחק בין העמדות, לא מה נכון.',
    ],
    more: 'למתודולוגיה המלאה ←',
  },

  presets: {
    title: 'תרחישים מוכנים',
    'opposition-arab': 'אופוזיציה + תמיכה ערבית מבחוץ',
    unity: 'אחדות',
    opposition: 'גוש האופוזיציה',
    coalition: 'גוש הקואליציה',
    blocNote: 'חלוקת הגושים לפי הסקר האחרון שפורסם בבקלפי (חדשות 12).',
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
    clashChip: (n) => `+${n} ✕`,
    clashChipLabel: (n) => n === 1
      ? 'הוספתה תיצור סתירה חזיתית בנושא אחד'
      : `הוספתה תיצור סתירה חזיתית ב-${n} נושאים`,
    coverage: (n) => `עמדה ב-${n}/8`,
  },

  seats: {
    counter: (n) => `≈${n} / 61`,
    missing: (n) => `חסרים ${n} ל-61`,
    reached: 'יש רוב של 61',
    withOutside: (inside, out) => `${inside} בקואליציה + ${out} מבחוץ`,
    borderlineNote: (n) => `כולל ${n} של מפלגה על הסף, ייתכן 0`,
    unityMissing: (n) => `חסרים לכם ${n} מנדטים ל-61`,
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

  results: {
    pickOne: 'בחרו מפלגה אחת לפחות, או תרחיש מוכן.',
    addPartner: 'הוסיפו שותפה כדי לראות התנגשויות',
    crisesTitle: (n) => n === 1 ? 'המשבר שמחכה לקואליציה הזו' : `${n} המשברים שמחכים לקואליציה הזו`,
    noCrises: 'אין פערים מהותיים בין השותפות',
    morePairs: (n) => n === 1 ? '+ זוג נוסף' : `+${n} זוגות נוספים`,
    glueTitle: 'מה מדביק אותה',
    noGlue: 'אין נושא שכל השותפות מסכימות עליו',
    glueCoverage: (k, n) => `(${k} מתוך ${n} שותפות הביעו עמדה)`,
    frictionTitle: 'השותפה שמייצרת הכי הרבה חיכוך',
    frictionTie: 'השותפות שמייצרות הכי הרבה חיכוך',
    whatIfRemove: 'מה אם נוריד אותה?',
    withoutPreview: (clashes, before, seats) => seats == null
      ? `בלעדיה: ${clashes} נושאים בסתירה במקום ${before}`
      : `בלעדיה: ${clashes} נושאים בסתירה במקום ${before} · ≈${seats} מנדטים`,
    removed: (n) => `${n} הוסרה`,
    undo: 'בטלו',
    overall: (x, y) => `${x} מתוך ${y} נושאים ללא סתירה חזיתית`,
    noData: 'אין נתונים',
    live: (name, n) => `${name}: ${n} סתירות חזיתיות בקואליציה`,
  },

  matrix: {
    title: 'מפת העמדות',
    reference: '● נקודת ייחוס',
    relBase: (n) => `הצבע = הפער מול ${n} (הבסיס)`,
    relWorst: 'הצבע = ההתנגשות החמורה ביותר של המפלגה בנושא מול שותפה כלשהי',
    baseNull: 'לבסיס אין עמדה',
    cellLabel: (party, topic, level, ref) => ref
      ? `${party}, ${topic}: ${level} מול ${ref}`
      : `${party}, ${topic}: ${level}`,
  },

  sheet: {
    close: 'סגירה',
    source: 'מקור',
    via: 'דרך בקלפי',
    sourceTypes: { platform: 'מצע', statement: 'הצהרה', record: 'רקורד חקיקתי' },
    date: (d) => `מתאריך ${d}`,
    why: 'למה בצבע הזה?',
    noPosition: 'לא מצאנו עמדה מוצהרת של המפלגה בנושא הזה במקור שעומד בכללים שלנו.',
    gap: (a, b, d, la, lb) => `${a} ↔ ${b}: ${d} דרגות (${la} ↔ ${lb})`,
    gapRed: (a, b, d, red) => `${a} ↔ ${b}: ${d} דרגות, ו${red} הצהירה שזה קו אדום שלה`,
    officialName: 'שם הרשימה הרשמי',
  },

  pair: {
    title: 'השוואת זוג',
    compareWith: 'השוו עם…',
    summary: (agree, minor, major, clash, n) =>
      `מסכימות ב-${agree}, פער קל ב-${minor}, פער מהותי ב-${major}, סתירה חזיתית ב-${clash}, מתוך ${n} נושאים`,
  },

  share: {
    button: 'שתפו',
    copied: 'הקישור הועתק',
    whatsapp: 'שלחו בוואטסאפ',
    text: (names, clashes) => `הקואליציה שבניתי: ${names} · ${clashes} סתירות חזיתיות`,
  },

  method: {
    title: 'מתודולוגיה, מקורות והבהרות',
    colorRule: 'אדום = המפלגות רחוקות 3 דרגות או יותר בסולם, או 2 דרגות כשאחת מהן הצהירה שזה קו אדום שלה.',
    disclaimer: 'זה לא המלצת הצבעה.',
    independent: 'האתר עצמאי ואינו קשור לבקלפי או לאף מפלגה.',
    names: 'שמות הרשימות לפי פרסום ועדת הבחירות המרכזית.',
  },

  footer: {
    by: 'Lioz Akirav',
    github: 'GitHub',
    corrections: 'תיקונים:',
    openData: 'הנתונים והמקורות פתוחים לבדיקה',
  },
};
