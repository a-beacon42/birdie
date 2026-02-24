/**
 * Sentry initialisation — call once at app startup.
 *
 * Reads the optional SENTRY_DSN env variable. When absent (local dev),
 * Sentry initialises as a no-op so the rest of the app can call
 * `Sentry.captureException` without guarding.
 */

import * as Sentry from "@sentry/react-native";
import { SENTRY_DSN } from "@env";

let _initialised = false;

export function initSentry(): void {
    if (_initialised) return;
    _initialised = true;

    const dsn = SENTRY_DSN ?? "";
    if (!dsn) {
        // No DSN configured — Sentry is effectively disabled.
        return;
    }

    Sentry.init({
        dsn,
        // Capture 100% of errors; lower in production if volume is high
        tracesSampleRate: __DEV__ ? 1.0 : 0.2,
        enableAutoSessionTracking: true,
        debug: __DEV__,
    });
}

export { Sentry };
