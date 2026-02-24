/**
 * AudioPlayer — Plays bird audio from Xeno-canto URLs.
 * Shows a simple play/pause button with attribution.
 *
 * On web, uses an HTML5 <audio> element for reliable playback.
 * On native, uses expo-av Audio.Sound.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { colors, spacing, radii, typography } from "../theme";

// Only import expo-av on native — web uses HTML5 <audio>
const Audio = Platform.OS !== "web"
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ? require("expo-av").Audio
    : null;

interface AudioPlayerProps {
    audioUrl: string;
    attribution?: string;
}

const AudioPlayer: React.FC<AudioPlayerProps> = ({ audioUrl, attribution }) => {
    // --- Native: expo-av Sound ref ---
    const soundRef = useRef<InstanceType<typeof Audio.Sound> | null>(null);
    // --- Web: HTML5 Audio ref ---
    const htmlAudioRef = useRef<HTMLAudioElement | null>(null);

    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        return () => {
            // Cleanup on unmount
            if (Platform.OS === "web") {
                if (htmlAudioRef.current) {
                    htmlAudioRef.current.pause();
                    htmlAudioRef.current = null;
                }
            } else {
                if (soundRef.current) {
                    soundRef.current.unloadAsync();
                }
            }
        };
    }, []);

    // Reset when URL changes
    useEffect(() => {
        setError(null);
        if (Platform.OS === "web") {
            if (htmlAudioRef.current) {
                htmlAudioRef.current.pause();
                htmlAudioRef.current = null;
                setIsPlaying(false);
            }
        } else {
            if (soundRef.current) {
                soundRef.current.unloadAsync();
                soundRef.current = null;
                setIsPlaying(false);
            }
        }
    }, [audioUrl]);

    const togglePlayback = useCallback(async () => {
        if (!audioUrl) return;

        if (Platform.OS === "web") {
            // --- Web: HTML5 Audio ---
            try {
                if (htmlAudioRef.current) {
                    if (isPlaying) {
                        htmlAudioRef.current.pause();
                        setIsPlaying(false);
                    } else {
                        await htmlAudioRef.current.play();
                        setIsPlaying(true);
                    }
                } else {
                    setIsLoading(true);
                    const audio = new window.Audio(audioUrl);
                    audio.addEventListener("ended", () => setIsPlaying(false));
                    audio.addEventListener("canplaythrough", () => setIsLoading(false), { once: true });
                    htmlAudioRef.current = audio;
                    await audio.play();
                    setIsPlaying(true);
                    setIsLoading(false);
                }
            } catch (err) {
                console.error("Audio playback error:", err);
                setError("Audio unavailable");
                setIsLoading(false);
            }
        } else {
            // --- Native: expo-av ---
            try {
                if (soundRef.current) {
                    if (isPlaying) {
                        await soundRef.current.pauseAsync();
                        setIsPlaying(false);
                    } else {
                        await soundRef.current.playAsync();
                        setIsPlaying(true);
                    }
                } else {
                    setIsLoading(true);
                    const { sound } = await Audio.Sound.createAsync(
                        { uri: audioUrl },
                        { shouldPlay: true }
                    );
                    soundRef.current = sound;
                    setIsPlaying(true);
                    setIsLoading(false);

                    sound.setOnPlaybackStatusUpdate((status: { isLoaded: boolean; didJustFinish?: boolean }) => {
                        if (status.isLoaded && status.didJustFinish) {
                            setIsPlaying(false);
                        }
                    });
                }
            } catch (err) {
                console.error("Audio playback error:", err);
                setError("Audio unavailable");
                setIsLoading(false);
            }
        }
    }, [audioUrl, isPlaying]);

    if (!audioUrl) return null;

    return (
        <View style={styles.container}>
            {error ? (
                <View style={styles.errorRow} accessibilityRole="alert">
                    <Text style={styles.errorIcon}>⚠</Text>
                    <Text style={styles.errorText}>{error}</Text>
                    <Pressable
                        onPress={() => { setError(null); }}
                        accessibilityRole="button"
                        accessibilityLabel="Retry audio playback"
                    >
                        <Text style={styles.retryLabel}>Retry</Text>
                    </Pressable>
                </View>
            ) : (
                <Pressable
                    style={styles.playButton}
                    onPress={togglePlayback}
                    disabled={isLoading}
                >
                    <Text style={styles.playIcon}>
                        {isLoading ? "⏳" : isPlaying ? "⏸" : "▶"}
                    </Text>
                    <Text style={styles.playLabel}>
                        {isLoading ? "Loading..." : isPlaying ? "Pause" : "Play Song"}
                    </Text>
                </Pressable>
            )}
            {attribution ? (
                <Text style={styles.attribution} numberOfLines={1}>
                    {attribution}
                </Text>
            ) : null}
        </View>
    );
};

export default AudioPlayer;

const styles = StyleSheet.create({
    container: {
        alignItems: "center",
        marginTop: spacing.sm,
    },
    playButton: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: colors.accent + "30",
        borderWidth: 1,
        borderColor: colors.accent,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.lg,
        borderRadius: radii.full,
        gap: spacing.sm,
    },
    playIcon: {
        fontSize: 16,
    },
    playLabel: {
        ...typography.label,
        color: colors.accentDark,
    },
    errorRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.sm,
        backgroundColor: colors.incorrect + "18",
        borderWidth: 1,
        borderColor: colors.incorrect + "40",
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.lg,
        borderRadius: radii.full,
    },
    errorIcon: {
        fontSize: 14,
    },
    errorText: {
        ...typography.label,
        color: colors.incorrect,
    },
    retryLabel: {
        ...typography.label,
        color: colors.primary,
        textDecorationLine: "underline" as const,
    },
    attribution: {
        ...typography.caption,
        color: colors.textMuted,
        marginTop: spacing.xs,
        paddingHorizontal: spacing.lg,
    },
});
