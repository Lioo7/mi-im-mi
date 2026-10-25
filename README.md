# מי עם מי

**בנו קואליציה וגלו איפה היא תתפרק.**

אתר סטטי בעברית (RTL, מובייל קודם) שמראה איפה העמדות של מפלגות שעשויות לשבת יחד בקואליציה מתנגשות, ואיפה הן מסכימות, בבחירות לכנסת ה-26 (27.10.2026).

- **האתר:** https://mi-im-mi.netlify.app/ (הקישור הסופי יעודכן אחרי הפרסום)
- **לא המלצת הצבעה.** האתר עצמאי ואינו קשור לאף מפלגה.

## איך זה עובד (בקצרה)
1. לכל אחת מ-14 המפלגות קבענו מיקום בסולם של 5 נקודות בכל אחד מ-8 נושאים, **רק לפי מה שהמפלגה עצמה אמרה או כתבה** (מצע, הצהרה בלשונה, או רקורד חקיקתי).
2. ההתאמה בין שתי מפלגות מחושבת אוטומטית מהמרחק בסולם: 0 = מסכימות, 1 = פער קל, 2 = פער מהותי, 3 ומעלה (או 2 כשמפלגה הצהירה שזה קו אדום שלה) = סתירה חזיתית.
3. כשאין מקור שעומד בכללים, העמדה מסומנת "אין עמדה מוצהרת". לא מנחשים.
4. קו אדום מסומן רק כשהמפלגה או מנהיגה אמרו בלשונם שבלי הנושא לא ייכנסו לממשלה, או שהוא אינו נתון למשא ומתן. סדר עדיפויות אינו קו אדום.
5. לא מציגים ציון כולל. מציגים אילו נושאים מתנגשים, מה מדביק את הקואליציה ומי מייצרת הכי הרבה חיכוך.

המתודולוגיה המלאה (הסולמות, כללי המקורות, כיסוי הנתונים וסוגי המקורות לפי גוש) נמצאת באתר, בסעיף [`#method`](https://mi-im-mi.netlify.app/#method).

## הנתונים
כל הנתונים פתוחים לבדיקה ב-[`site/data/`](site/data/):

| קובץ | תוכן |
|---|---|
| `parties.json` | 14 מפלגות: `id`, `officialName` ו-`name` (לפי רשימת ועדת הבחירות המרכזית), `ballotLetters`, `leader`, `pollAvg`, `threshold`, `bloc` (לפי בקלפי), `platformStatus`, `linkedWith`, `components` |
| `topics.json` | 8 נושאים: שם, תווית קצרה, ותווית לכל אחת מ-5 נקודות הסולם |
| `positions.json` | 112 עמדות: `position` (‏−2…2 או `null`), `redLine`, `componentsDisagree`, `summary`, `quote`, `sourceUrl`, `sourceType` (‏`platform`/`statement`/`record`), `sourceDate`, `viaUrl`, `confidence` |
| `meta.json` | תאריך עדכון, תאריך הסקרים, `showSeats` |

מספרי המנדטים הם ממוצע הסקרים האחרונים כפי שמופיע ב-[בקלפי](https://www.bakalpi.co.il/he), ומוצגים כסדר גודל בלבד.

## תיקון טעות
מצאתם עמדה שגויה או מקור שלא תומך בה? כתבו ל-lioz.akirav@gmail.com או פתחו [issue](https://github.com/Lioo7/mi-im-mi/issues) עם הקישור למקור.

## למפתחים
אתר סטטי בלי build ובלי תלויות: HTML, CSS ו-JavaScript (ES modules). `node --test` להרצת הבדיקות, `node scripts/validate.mjs` לאימות הנתונים, `node scripts/smoke.mjs` לבדיקת עשן במסך של טלפון. שינויים בעמדות נעשים רק דרך `scripts/import-csv.mjs`. ראו `CLAUDE.md` ו-`PLAN.md`.

---

## English
**מי עם מי** ("Who With Whom") is a static, Hebrew-only, mobile-first web app for the Israeli Knesset elections of 27 October 2026. Pick parties that might sit in a coalition and see where their stated positions clash or agree across eight topics. Every position is placed on a five-point axis from the party's own platform, statements or legislative record, with a link to the source; where no qualifying source exists, the cell says "no stated position". Compatibility is computed from axis distance, with no per-pair judgments and no overall score. It is not a voting recommendation and is unaffiliated with any party. All data is open in [`site/data/`](site/data/). Corrections: lioz.akirav@gmail.com or a GitHub issue.
