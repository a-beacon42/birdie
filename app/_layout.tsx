/**
 * Root layout — wraps the entire app with SafeAreaProvider and global styles.
 * This is the entry point for expo-router.
 */

import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { colors } from "../src/theme";

export default function RootLayout() {
    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaProvider>
                <StatusBar style="dark" />
                <Stack
                    screenOptions={{
                        headerShown: false,
                        contentStyle: { backgroundColor: colors.background },
                        animation: "slide_from_right",
                    }}
                />
            </SafeAreaProvider>
        </GestureHandlerRootView>
    );
}
