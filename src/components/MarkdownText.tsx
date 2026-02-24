/**
 * MarkdownText — lightweight Markdown renderer using only RN primitives.
 *
 * Supports: **bold**, *italic*, `inline code`, [links](url),
 * headings (# / ## / ###), bullet lists (- / *), ordered lists (1.),
 * blockquotes (>), and fenced code blocks (```).
 *
 * Uses only <Text> and <View> — no flex:1 containers, no external deps.
 */

import React from "react";
import {
    Linking,
    Platform,
    StyleSheet,
    Text,
    TextStyle,
    View,
} from "react-native";
import { colors, radii, spacing, typography } from "../theme";

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */
interface MarkdownTextProps {
    children: string;
    baseStyle?: TextStyle;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
const ALLOWED_URL_SCHEMES = /^https?:\/\//i;

const safeOpenURL = (url: string) => {
    if (ALLOWED_URL_SCHEMES.test(url)) {
        Linking.openURL(url);
    }
};

/* ------------------------------------------------------------------ */
/*  Inline parser                                                      */
/* ------------------------------------------------------------------ */
type Inline =
    | { t: "text"; v: string }
    | { t: "bold"; v: string }
    | { t: "italic"; v: string }
    | { t: "code"; v: string }
    | { t: "link"; label: string; url: string };

const INLINE_RE =
    /(\[([^\]]+)\]\(([^)]+)\))|(`[^`\n]+`)|(\*\*[^*\n]+?\*\*|__[^_\n]+?__)|(\*[^*\n]+?\*|_[^_\n]+?_)/g;

const parseInline = (raw: string): Inline[] => {
    const out: Inline[] = [];
    let last = 0;
    let m: RegExpExecArray | null;

    while ((m = INLINE_RE.exec(raw)) !== null) {
        if (m.index > last) out.push({ t: "text", v: raw.slice(last, m.index) });

        if (m[1]) {
            // link
            out.push({ t: "link", label: m[2], url: m[3] });
        } else if (m[4]) {
            // inline code
            out.push({ t: "code", v: m[4].slice(1, -1) });
        } else if (m[5]) {
            // bold
            out.push({ t: "bold", v: m[5].slice(2, -2) });
        } else if (m[6]) {
            // italic
            out.push({ t: "italic", v: m[6].slice(1, -1) });
        }
        last = m.index + m[0].length;
    }
    if (last < raw.length) out.push({ t: "text", v: raw.slice(last) });
    return out;
};

const renderInline = (tokens: Inline[], base?: TextStyle) =>
    tokens.map((tok, i) => {
        switch (tok.t) {
            case "bold":
                return (
                    <Text key={i} style={[base, s.bold]}>
                        {tok.v}
                    </Text>
                );
            case "italic":
                return (
                    <Text key={i} style={[base, s.italic]}>
                        {tok.v}
                    </Text>
                );
            case "code":
                return (
                    <Text key={i} style={[base, s.inlineCode]}>
                        {tok.v}
                    </Text>
                );
            case "link":
                return (
                    <Text
                        key={i}
                        style={[base, s.link]}
                        accessibilityRole="link"
                        onPress={() => safeOpenURL(tok.url)}
                    >
                        {tok.label}
                    </Text>
                );
            default:
                return <Text key={i}>{tok.v}</Text>;
        }
    });

/* ------------------------------------------------------------------ */
/*  Block parser                                                       */
/* ------------------------------------------------------------------ */
type Block =
    | { t: "p"; text: string }
    | { t: "h"; level: number; text: string }
    | { t: "ul"; items: string[] }
    | { t: "ol"; items: string[] }
    | { t: "bq"; text: string }
    | { t: "code"; text: string };

const parseBlocks = (md: string): Block[] => {
    const blocks: Block[] = [];
    const lines = md.replace(/\r\n/g, "\n").split("\n");

    let buf: string[] = [];
    let ul: string[] = [];
    let ol: string[] = [];
    let inCode = false;
    let code: string[] = [];

    const flushP = () => {
        if (!buf.length) return;
        blocks.push({ t: "p", text: buf.join(" ").trim() });
        buf = [];
    };
    const flushUl = () => {
        if (!ul.length) return;
        blocks.push({ t: "ul", items: ul });
        ul = [];
    };
    const flushOl = () => {
        if (!ol.length) return;
        blocks.push({ t: "ol", items: ol });
        ol = [];
    };

    for (const raw of lines) {
        const ln = raw.trimEnd();

        // fenced code
        if (ln.startsWith("```")) {
            flushP(); flushUl(); flushOl();
            if (inCode) { blocks.push({ t: "code", text: code.join("\n") }); code = []; }
            inCode = !inCode;
            continue;
        }
        if (inCode) { code.push(raw); continue; }

        // blank
        if (!ln.trim()) { flushP(); flushUl(); flushOl(); continue; }

        // heading
        const hm = ln.match(/^(#{1,6})\s+(.*)$/);
        if (hm) { flushP(); flushUl(); flushOl(); blocks.push({ t: "h", level: hm[1].length, text: hm[2] }); continue; }

        // blockquote
        const bq = ln.match(/^\s*>\s?(.*)$/);
        if (bq) { flushP(); flushUl(); flushOl(); blocks.push({ t: "bq", text: bq[1] }); continue; }

        // bullet
        const bm = ln.match(/^\s*[-*+]\s+(.*)$/);
        if (bm) { flushP(); flushOl(); ul.push(bm[1]); continue; }

        // ordered
        const om = ln.match(/^\s*\d+\.\s+(.*)$/);
        if (om) { flushP(); flushUl(); ol.push(om[1]); continue; }

        // paragraph text
        flushUl(); flushOl();
        buf.push(ln.trim());
    }

    if (inCode && code.length) blocks.push({ t: "code", text: code.join("\n") });
    flushP(); flushUl(); flushOl();
    return blocks;
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
const MarkdownText: React.FC<MarkdownTextProps> = ({ children, baseStyle }) => {
    const blocks = parseBlocks(children);

    return (
        <View>
            {blocks.map((b, i) => {
                switch (b.t) {
                    case "h": {
                        const hs = b.level <= 2 ? s.h1 : b.level === 3 ? s.h3 : s.h4;
                        return (
                            <Text key={i} style={[baseStyle, hs]}>
                                {renderInline(parseInline(b.text), baseStyle)}
                            </Text>
                        );
                    }
                    case "ul":
                        return (
                            <View key={i} style={s.listWrap}>
                                {b.items.map((item, j) => (
                                    <View key={j} style={s.listRow}>
                                        <Text style={[baseStyle, s.bullet]}>•</Text>
                                        <Text style={[s.body, baseStyle, s.listText]}>
                                            {renderInline(parseInline(item), baseStyle)}
                                        </Text>
                                    </View>
                                ))}
                            </View>
                        );
                    case "ol":
                        return (
                            <View key={i} style={s.listWrap}>
                                {b.items.map((item, j) => (
                                    <View key={j} style={s.listRow}>
                                        <Text style={[baseStyle, s.bullet]}>{j + 1}.</Text>
                                        <Text style={[s.body, baseStyle, s.listText]}>
                                            {renderInline(parseInline(item), baseStyle)}
                                        </Text>
                                    </View>
                                ))}
                            </View>
                        );
                    case "bq":
                        return (
                            <View key={i} style={s.blockquote}>
                                <Text style={[s.body, baseStyle, s.bqText]}>
                                    {renderInline(parseInline(b.text), baseStyle)}
                                </Text>
                            </View>
                        );
                    case "code":
                        return (
                            <View key={i} style={s.codeBlock}>
                                <Text style={[baseStyle, s.codeText]}>{b.text}</Text>
                            </View>
                        );
                    default:
                        return (
                            <Text key={i} style={[s.body, baseStyle]}>
                                {renderInline(parseInline(b.text), baseStyle)}
                            </Text>
                        );
                }
            })}
        </View>
    );
};

export default MarkdownText;

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */
const mono = Platform.select({ ios: "Menlo", default: "monospace" });

const s = StyleSheet.create({
    body: { ...typography.body, color: colors.text },
    h1: { ...typography.h2, color: colors.text, marginBottom: spacing.xs },
    h3: { ...typography.h3, color: colors.text, marginBottom: spacing.xs },
    h4: { ...typography.label, color: colors.text, marginBottom: spacing.xs },
    bold: { fontWeight: "700" },
    italic: { fontStyle: "italic" },
    link: { color: colors.primary, textDecorationLine: "underline" },
    inlineCode: {
        fontFamily: mono,
        fontSize: 14,
        backgroundColor: colors.surfaceElevated,
        borderRadius: radii.sm,
        paddingHorizontal: 3,
    },
    listWrap: { gap: spacing.xs },
    listRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.xs },
    bullet: { ...typography.body, color: colors.textSecondary, minWidth: 16 },
    listText: { flex: 1 },
    blockquote: {
        borderLeftWidth: 3,
        borderLeftColor: colors.primaryLight,
        paddingLeft: spacing.sm,
        marginVertical: spacing.xs,
    },
    bqText: { color: colors.textSecondary },
    codeBlock: {
        backgroundColor: colors.surfaceElevated,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radii.sm,
        padding: spacing.sm,
        marginVertical: spacing.xs,
    },
    codeText: {
        fontFamily: mono,
        fontSize: 13,
        color: colors.text,
    },
});
