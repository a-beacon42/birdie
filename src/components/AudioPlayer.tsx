/**
 * AudioPlayer — Plays bird audio from Xeno-canto URLs.
 * Shows a simple play/pause button with attribution.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Audio } from "expo-av";
import { colors, spacing, radii, typography } from "../theme";

interface AudioPlayerProps {
    audioUrl: string;
    attribution?: string;
}

const AudioPlayer: React.FC<AudioPlayerProps> = ({ audioUrl, attribution }) => {
    const soundRef = useRef<Audio.Sound | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        return () => {
            // Cleanup on unmount
            if (soundRef.current) {
                soundRef.current.unloadAsync();
            }
        };
    }, []);

    // Reset when URL changes
    useEffect(() => {
        if (soundRef.current) {
            soundRef.current.unloadAsync();
            soundRef.current = null;
            setIsPlaying(false);
        }
    }, [audioUrl]);

    const togglePlayback = useCallback(async () => {
        if (!audioUrl) return;

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

                sound.setOnPlaybackStatusUpdate((status) => {
                    if (status.isLoaded && status.didJustFinish) {
                        setIsPlaying(false);
                    }
                });
            }
        } catch (err) {
            console.error("Audio playback error:", err);
            setIsLoading(false);
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
