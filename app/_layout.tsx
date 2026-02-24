/**
 * Root layout — wraps the entire app with SafeAreaProvider and global styles.
 * This is the entry point for expo-router.
 *
 * On web, constrains the app to a mobile-width container centred on screen
 * so the portrait-oriented UI looks natural on desktop browsers.
 */

import { Platform, View } from "react-native";
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { colors } from "../src/theme";
import ErrorBoundary from "../src/components/ErrorBoundary";
import OfflineBanner from "../src/components/OfflineBanner";
import { useNetworkStatus } from "../src/hooks/useNetworkStatus";

export default function RootLayout() {
    const { isConnected } = useNetworkStatus();

    const content = (
        <ErrorBoundary>
            <GestureHandlerRootView style={{ flex: 1 }}>
                <SafeAreaProvider>
                    <StatusBar style="dark" />
                    {!isConnected && <OfflineBanner />}
                    <Stack
                        screenOptions={{
                            headerShown: false,
                            contentStyle: { backgroundColor: colors.background },
                            animation: "slide_from_right",
                        }}
                    />
                </SafeAreaProvider>
            </GestureHandlerRootView>
        </ErrorBoundary>
    );

    // On web, centre the app in a mobile-width column with a subtle border
    if (Platform.OS === "web") {
        return (
            <View
                style={{
                    flex: 1,
                    backgroundColor: "#E8E8E3",
                    alignItems: "center",
                }}
            >
                <View
                    style={{
                        flex: 1,
                        width: "100%",
                        maxWidth: 480,
                        backgroundColor: colors.background,
                        // CSS-only shadow works on web
                        ...(Platform.OS === "web"
                            ? ({ boxShadow: "0 0 24px rgba(0,0,0,0.08)" } as any)
                            : {}),
                    }}
                >
                    {content}
                </View>
            </View>
        );
    }

    return content;
}
