// The /en/ entry page (#21): straight on to the app in English, keeping the fragment (view, coalition, pair).
// Relative, so it works from /en/ and /en alike, on any deploy URL. No beacon here: the app counts the visit once.
import { enEntryHash } from './compat.js';

location.replace(`../${enEntryHash(location.hash)}`);
