import { z } from "zod";
import * as dotenv from "dotenv";
dotenv.config();

/**
 * Helper per trasformare stringhe separate da punto e virgola in Array di stringhe.
 */
const semicolonStringToArray = z.string().transform((val) =>
    val
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean),
);

/**
 * Schema di validazione per l'intera configurazione dell'app.
 * Utilizziamo z.coerce per convertire automaticamente le stringhe in numeri o booleani.
 */
const ConfigSchema = z.object({
    // --- CORE & LOGGING ---
    LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),
    LOG_FILE: z
        .string()
        .default("false")
        .transform((val) => val.toLowerCase() === "true"),

    SERVER_PORT: z.coerce.number().optional(),

    COLLECT_SINCE: z.iso
        .date() // Valida la stringa YYYY-MM-DD
        .pipe(z.coerce.date()) // La trasforma in oggetto Date
        .default(new Date("2026-01-01")),

    // --- AZURE / MICROSOFT GRAPH ---
    TENANT_ID: z.string().min(1, "TENANT_ID mancante"),
    CLIENT_ID: z.string().min(1, "CLIENT_ID mancante"),
    TOP: z.coerce.number().default(50),
    EMAIL_PER_MONTH_MAX: z.coerce.number().default(1000),
    EMAIL_EXCLUDE_ADDRESSES: semicolonStringToArray,
    TEAMS_CHAT_LIMIT: z.coerce.number().default(1000),

    // --- TARGET PROCESS ---
    TP_BASE_URL: z.url({ message: "URL TargetProcess non valido" }).optional(),
    VITE_TP_BASE_URL: z.url({ message: "URL Vite TargetProcess non valido" }).optional(),
    TP_TOKEN: z.string().optional(),
    MISC_TASK_ID: z.string().optional(),
    KB_RELEVANCE_WINDOW_DAYS: z.coerce.number().default(90),

    // --- AI PROVIDERS ---
    // Anthropic
    CLAUDE_API_KEY: z.string().optional(),
    CLAUDE_MODEL: z.string().default("claude-haiku-4-5-20251001"),
    CLAUDE_MODEL_MAX_TPM: z.coerce.number().default(200000),

    // Gemini
    GEMINI_API_KEY: z.string().optional(),
    GEMINI_MODEL: z.string().default("gemini-3.1-flash-lite-preview"),
    GEMINI_MODEL_MAX_TPM: z.coerce.number().default(1000000),

    // OpenAI / Ollama
    OPENAI_BASE_URL: z.url({ message: "URL OpenAI non valido" }).nonoptional(),
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_MODEL: z.string().default("qwen2.5-coder:3b"),
    OPENAI_MODEL_MAX_TPM: z.coerce.number().default(8000),
    OPENAI_NUM_CTX: z.coerce.number().default(32000),
    OPENAI_REQUEST_TIMEOUT_MS: z.coerce.number().default(900000),
    OPENAI_KB_ITEM_CAP: z.coerce.number().default(20),
    OPENAI_SIGNAL_DETAIL: z.enum(["full", "compact", "minimal"]).default("compact"),

    // Perplexity
    PERPLEXITY_API_KEY: z.string().optional(),

    // --- COLLECTORS: GIT & SVN ---
    GIT_ROOTS: semicolonStringToArray,
    GIT_EMAILS: semicolonStringToArray,
    SVN_URL: z.url({ message: "URL SVN non valido" }).nonoptional(),
    SVN_USERNAME: z.string().nonoptional(),
    SVN_PASSWORD: z.string().nonoptional(),
    SVN_BIN: z.string().default("svn"),
    SVN_ROOTS: semicolonStringToArray.optional(),

    // --- COLLECTORS: ZUCCHETTI & NIBOL ---
    ZUCCHETTI_USERNAME: z.string().nonoptional(),
    ZUCCHETTI_PASSWORD: z.string().nonoptional(),
    ZUCCHETTI_HEADLESS: z.coerce.boolean().default(false),

    NIBOL_PROFILE_DIR: z.string().default("./.automation-chrome/nibol"),
    NIBOL_URL: z.url({ message: "URL Nibol non valido" }).default("https://app.nibol.com"),
    NIBOL_USER_NAME: z.string().nonoptional(),

    // --- BROWSER HISTORY ---
    CHROME_PROFILE_DIRS: semicolonStringToArray,
    FIREFOX_PROFILE_DIR: z.string().nonoptional(),

    // --- WIKI & DOCS ---
    CONFLUENCE_TOKEN: z.string().optional(),
    OBSIDIAN_TOKEN: z.string().optional(),

    // --- ENVIRONMENT ---
    IS_PRODUCTION: z.boolean().default(process.env.NODE_ENV === "production"),
});

/**
 * Esportiamo l'oggetto CONFIG validato.
 * Viene popolato leggendo process.env.
 */
export const CONFIG = ConfigSchema.parse({
    LOG_LEVEL: process.env.LOG_LEVEL,
    LOG_FILE: process.env.LOG_FILE,

    COLLECT_SINCE: process.env.COLLECT_SINCE,

    SERVER_PORT: process.env.SERVER_PORT,

    TENANT_ID: process.env.TENANT_ID,
    CLIENT_ID: process.env.CLIENT_ID,
    TOP: process.env.TOP,
    EMAIL_PER_MONTH_MAX: process.env.EMAIL_PER_MONTH_MAX,
    EMAIL_EXCLUDE_ADDRESSES: process.env.EMAIL_EXCLUDE_ADDRESSES,
    TEAMS_CHAT_LIMIT: process.env.TEAMS_CHAT_LIMIT,

    TP_BASE_URL: process.env.TP_BASE_URL,
    VITE_TP_BASE_URL: process.env.VITE_TP_BASE_URL,
    TP_TOKEN: process.env.TP_TOKEN,
    MISC_TASK_ID: process.env.MISC_TASK_ID,
    KB_RELEVANCE_WINDOW_DAYS: process.env.KB_RELEVANCE_WINDOW_DAYS,

    CLAUDE_API_KEY: process.env.CLAUDE_API_KEY,
    CLAUDE_MODEL: process.env.CLAUDE_MODEL,
    CLAUDE_MODEL_MAX_TPM: process.env.CLAUDE_MODEL_MAX_TPM,

    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODEL: process.env.GEMINI_MODEL,
    GEMINI_MODEL_MAX_TPM: process.env.GEMINI_MODEL_MAX_TPM,

    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    OPENAI_MODEL_MAX_TPM: process.env.OPENAI_MODEL_MAX_TPM,
    OPENAI_NUM_CTX: process.env.OPENAI_NUM_CTX,
    OPENAI_REQUEST_TIMEOUT_MS: process.env.OPENAI_REQUEST_TIMEOUT_MS,
    OPENAI_KB_ITEM_CAP: process.env.OPENAI_KB_ITEM_CAP,
    OPENAI_SIGNAL_DETAIL: process.env.OPENAI_SIGNAL_DETAIL,

    PERPLEXITY_API_KEY: process.env.PERPLEXITY_API_KEY,

    GIT_ROOTS: process.env.GIT_ROOTS,
    GIT_EMAILS: process.env.GIT_EMAILS,
    SVN_URL: process.env.SVN_URL,
    SVN_USERNAME: process.env.SVN_USERNAME,
    SVN_PASSWORD: process.env.SVN_PASSWORD,
    SVN_BIN: process.env.SVN_BIN,
    SVN_ROOTS: process.env.SVN_ROOTS,

    ZUCCHETTI_USERNAME: process.env.ZUCCHETTI_USERNAME,
    ZUCCHETTI_PASSWORD: process.env.ZUCCHETTI_PASSWORD,
    ZUCCHETTI_HEADLESS: process.env.ZUCCHETTI_HEADLESS,

    NIBOL_PROFILE_DIR: process.env.NIBOL_PROFILE_DIR,
    NIBOL_URL: process.env.NIBOL_URL,
    NIBOL_USER_NAME: process.env.NIBOL_USER_NAME,

    CHROME_PROFILE_DIRS: process.env.CHROME_PROFILE_DIRS,
    FIREFOX_PROFILE_DIR: process.env.FIREFOX_PROFILE_DIR,

    CONFLUENCE_TOKEN: process.env.CONFLUENCE_TOKEN,
    OBSIDIAN_TOKEN: process.env.OBSIDIAN_TOKEN,
});

// Tipo inferito per utilità in altri file
export type AppConfig = z.infer<typeof ConfigSchema>;
