// ---------------------------------------------------------------------------
// Pre-flight content moderation for image/video generation prompts.
//
// Runs entirely client-side, before any request reaches the generation API.
// Denies prompts that:
//   1. Contain profanity or vulgar language
//   2. Depict a real, identifiable person committing a crime or other
//      illegal wrongdoing
//   3. Ask for a replica of a sensitive identity document (ID card,
//      passport, driver's license, etc.)
//
// There's no server-side moderation step in this app (browser -> n8n ->
// Replicate), so this is the only gate — it must run before generate()
// touches the network.
// ---------------------------------------------------------------------------

export type ModerationCategory =
    | "profanity"
    | "sensitive_document"
    | "real_person_crime";

export interface ModerationResult {
    blocked: boolean;
    category?: ModerationCategory;
}

const PROFANITY_WORDS = [
    "fuck", "fucking", "fucker", "motherfucker", "shit", "bullshit",
    "bitch", "asshole", "cunt", "dick", "pussy", "cock", "whore", "slut",
    "bastard", "nigger", "nigga", "faggot", "retard", "chink", "spic",
    "kike", "tranny",
];

const SENSITIVE_DOCUMENT_KEYWORDS = [
    "id card", "identity card", "identification card", "driver's license",
    "drivers license", "driver license", "passport", "social security card",
    "ssn card", "green card", "birth certificate", "national id card",
    "national identity card", "credit card number", "bank card",
];

const CRIME_KEYWORDS = [
    "murder", "murdering", "murderer", "assassinate", "assassination",
    "rape", "raping", "terrorist", "terrorism", "bombing", "mass shooting",
    "school shooting", "kidnap", "kidnapping", "torture", "torturing",
    "massacre", "genocide", "human trafficking", "drug trafficking",
    "child abuse", "beheading", "execution", "executing", "hostage",
    "arson", "hate crime", "robbing a bank", "committing a crime",
    "stabbing", "strangling", "poisoning someone",
];

const REAL_PERSON_INDICATORS = [
    "president", "prime minister", "senator", "governor", "mayor",
    "celebrity", "politician", "ceo of", "real person", "real life person",
    "actual photo of", "real photo of", "actual footage of",
];

// No NER available client-side — two consecutive capitalized words is a
// loose stand-in for a proper name (e.g. "Donald Trump", "Taylor Swift").
const PROPER_NAME_PATTERN = /\b[A-Z][a-zA-Z'-]+\s+[A-Z][a-zA-Z'-]+\b/;

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const hasWord = (text: string, word: string): boolean =>
    new RegExp(`\\b${escapeRegExp(word)}\\b`, "i").test(text);

const hasAnyWord = (text: string, words: string[]): boolean =>
    words.some((w) => hasWord(text, w));

export function checkPromptSafety(prompt: string): ModerationResult {
    const text = prompt.trim();
    if (!text) return { blocked: false };

    if (hasAnyWord(text, PROFANITY_WORDS)) {
        return { blocked: true, category: "profanity" };
    }

    if (hasAnyWord(text, SENSITIVE_DOCUMENT_KEYWORDS)) {
        return { blocked: true, category: "sensitive_document" };
    }

    if (hasAnyWord(text, CRIME_KEYWORDS)) {
        const mentionsRealPerson =
            hasAnyWord(text, REAL_PERSON_INDICATORS) ||
            PROPER_NAME_PATTERN.test(text);
        if (mentionsRealPerson) {
            return { blocked: true, category: "real_person_crime" };
        }
    }

    return { blocked: false };
}

export function getModerationRefusalMessage(
    result: ModerationResult,
): string {
    switch (result.category) {
        case "profanity":
            return "I can't generate that — the prompt contains profanity or vulgar language. Try rephrasing it.";
        case "sensitive_document":
            return "I can't generate that — creating replicas of ID cards, passports, or other identity documents isn't something I can help with.";
        case "real_person_crime":
            return "I can't generate that — I won't depict a real person committing a crime or illegal act.";
        default:
            return "I can't generate that because it violates content guidelines.";
    }
}
