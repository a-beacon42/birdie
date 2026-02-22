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
    const soundRef = useRef<any>(null);
    // --- Web: HTML5 Audio ref ---
    const htmlAudioRef = useRef<HTMLAudioElement | null>(null);

    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

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

                    sound.setOnPlaybackStatusUpdate((status: any) => {
                        if (status.isLoaded && status.didJustFinish) {
                            setIsPlaying(false);
                        }
                    });
                }
            } catch (err) {
                console.error("Audio playback error:", err);
                setIsLoading(false);
            }
        }
    }, [audioUrl, isPlaying]);

    if (!audioUrl) return null;

    return (
        <View style={styles.container}>
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
    attribution: {
        ...typography.caption,
        color: colors.textMuted,
        marginTop: spacing.xs,
        paddingHorizontal: spacing.lg,
    },
});
