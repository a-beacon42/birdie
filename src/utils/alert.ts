/**
 * Cross-platform alert utility.
 *
 * Alert.alert() is not supported on web — this falls back to window.alert
 * (or window.confirm for two-button alerts) on that platform.
 */

import { Alert, Platform } from "react-native";

export function showAlert(title: string, message?: string): void {
    if (Platform.OS === "web") {
        window.alert(message ? `${title}\n\n${message}` : title);
    } else {
        Alert.alert(title, message);
    }
}
