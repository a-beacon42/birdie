/**
 * SearchableDropdown — custom searchable dropdown built with RN primitives.
 *
 * Replaces react-native-element-dropdown which has touch-handling bugs
 * with React Native 0.79+ new architecture (nested TouchableWithoutFeedback
 * in a Modal fails to stop propagation → search TextInput can't receive focus).
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import {
    View,
    Text,
    TextInput,
    FlatList,
    Modal,
    Pressable,
    StyleSheet,
    Keyboard,
    Platform,
    useWindowDimensions,
    type LayoutRectangle,
    type ListRenderItemInfo,
} from "react-native";
import { colors, spacing, radii, typography } from "../theme";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/**
 * Get a property value from an item using a string field name.
 * This replaces `(item as any)[field]` with a type-safe helper.
 */
function getField<T, K extends keyof T & string>(item: T, field: K): T[K] {
    return item[field];
}

export interface SearchableDropdownProps<T> {
    /** Label shown above the dropdown when focused */
    label: string;
    /** The list of items to display */
    data: T[];
    /** Key of the item property to display as the label */
    labelField: keyof T & string;
    /** Key of the item property to use as the value */
    valueField: keyof T & string;
    /** Placeholder text when nothing is selected */
    placeholder?: string;
    /** Currently selected value (compared against valueField) */
    value: T[keyof T] | null;
    /** Called when the user selects an item */
    onChange: (item: T) => void;
    /** Called when the user taps the clear button. When provided and a value is selected, a × button is shown. */
    onClear?: () => void;
    /** Whether to show the search input (default true) */
    search?: boolean;
    /** Placeholder for the search input */
    searchPlaceholder?: string;
    /** Max height of the dropdown overlay */
    maxHeight?: number;
    /** Whether the dropdown is disabled */
    disabled?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

function SearchableDropdownInner<T>(props: SearchableDropdownProps<T>) {
    const {
        label,
        data,
        labelField,
        valueField,
        placeholder = "Select…",
        value,
        onChange,
        onClear,
        search = true,
        searchPlaceholder = "Search…",
        maxHeight = 300,
        disabled = false,
    } = props;

    const [visible, setVisible] = useState(false);
    const [searchText, setSearchText] = useState("");
    const [anchorLayout, setAnchorLayout] = useState<LayoutRectangle | null>(null);
    const [keyboardHeight, setKeyboardHeight] = useState(0);
    const anchorRef = useRef<View>(null);
    const searchInputRef = useRef<TextInput>(null);

    /* ---- keyboard tracking --------------------------------------- */

    useEffect(() => {
        const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
        const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

        const onShow = Keyboard.addListener(showEvent, (e) => {
            setKeyboardHeight(e.endCoordinates.height);
        });
        const onHide = Keyboard.addListener(hideEvent, () => {
            setKeyboardHeight(0);
        });

        return () => {
            onShow.remove();
            onHide.remove();
        };
    }, []);

    /* ---- derived ------------------------------------------------- */

    const selectedItem = useMemo(
        () => data.find((d) => getField(d, valueField) === value) ?? null,
        [data, value, valueField],
    );

    const displayText = selectedItem
        ? String(getField(selectedItem, labelField))
        : placeholder;

    const filteredData = useMemo(() => {
        if (!searchText) return data;
        const lower = searchText.toLowerCase();
        return data.filter((item) =>
            String(getField(item, labelField)).toLowerCase().includes(lower),
        );
    }, [data, searchText, labelField]);

    /* ---- handlers ------------------------------------------------ */

    const open = useCallback(() => {
        if (disabled) return;
        // Measure anchor position on screen so we can position the overlay below it.
        anchorRef.current?.measureInWindow((x, y, width, height) => {
            setAnchorLayout({ x, y, width, height });
            setVisible(true);
            setSearchText("");
        });
    }, [disabled]);

    const close = useCallback(() => {
        Keyboard.dismiss();
        setVisible(false);
        setSearchText("");
    }, []);

    const handleSelect = useCallback(
        (item: T) => {
            onChange(item);
            close();
        },
        [onChange, close],
    );

    /* ---- render helpers ------------------------------------------ */

    const renderItem = useCallback(
        ({ item }: ListRenderItemInfo<T>) => {
            const itemValue = getField(item, valueField);
            const isSelected = itemValue === value;
            return (
                <Pressable
                    style={({ pressed }) => [
                        styles.item,
                        isSelected && styles.itemSelected,
                        pressed && styles.itemPressed,
                    ]}
                    onPress={() => handleSelect(item)}
                >
                    <Text
                        style={[styles.itemText, isSelected && styles.itemTextSelected]}
                        numberOfLines={1}
                    >
                        {String(getField(item, labelField))}
                    </Text>
                </Pressable>
            );
        },
        [value, valueField, labelField, handleSelect],
    );

    const keyExtractor = useCallback(
        (_item: T, index: number) => String(index),
        [],
    );

    /* ---- overlay position ---------------------------------------- */

    const { height: screenH } = useWindowDimensions();
    let overlayStyle: Record<string, unknown> = {};
    if (anchorLayout) {
        const GAP = 4;
        const PAD = 8;
        const anchorTop = anchorLayout.y;
        const anchorBottom = anchorLayout.y + anchorLayout.height;
        const visibleBottom = screenH - keyboardHeight;

        const spaceBelow = visibleBottom - anchorBottom - GAP - PAD;
        const spaceAbove = anchorTop - GAP - PAD;

        let posTop: number | undefined;
        let posBottom: number | undefined;
        let dropdownHeight: number;

        if (spaceBelow >= 120) {
            // Enough room below the anchor, above the keyboard
            posTop = anchorBottom + GAP;
            dropdownHeight = Math.min(maxHeight, spaceBelow);
        } else if (spaceAbove >= 120) {
            // Flip above the anchor
            posBottom = screenH - anchorTop + GAP;
            dropdownHeight = Math.min(maxHeight, spaceAbove);
        } else {
            // Neither side has room — pin to top of screen, fill visible area
            posTop = PAD;
            dropdownHeight = Math.min(maxHeight, visibleBottom - PAD * 2);
        }

        overlayStyle = {
            position: "absolute" as const,
            left: anchorLayout.x,
            width: anchorLayout.width,
            maxHeight: dropdownHeight,
            ...(posTop !== undefined ? { top: posTop } : { bottom: posBottom }),
        };
    }

    /* ---- render -------------------------------------------------- */

    return (
        <View style={styles.wrapper}>
            {/* Floating label */}
            {visible && (
                <Text style={styles.floatingLabel}>{label}</Text>
            )}

            {/* Anchor / trigger */}
            <Pressable
                ref={anchorRef}
                style={[
                    styles.trigger,
                    visible && styles.triggerFocused,
                    disabled && styles.triggerDisabled,
                ]}
                onPress={open}
            >
                <Text
                    style={[
                        styles.triggerText,
                        !selectedItem && styles.triggerPlaceholder,
                    ]}
                    numberOfLines={1}
                >
                    {visible ? "…" : displayText}
                </Text>
                {onClear && selectedItem && !visible ? (
                    <Pressable
                        onPress={(e) => {
                            e.stopPropagation();
                            onClear();
                        }}
                        hitSlop={8}
                        style={styles.clearButton}
                        accessibilityRole="button"
                        accessibilityLabel={`Clear ${label}`}
                    >
                        <Text style={styles.clearButtonText}>✕</Text>
                    </Pressable>
                ) : (
                    <Text style={styles.chevron}>{visible ? "▲" : "▼"}</Text>
                )}
            </Pressable>

            {/* Overlay */}
            <Modal
                transparent
                visible={visible}
                animationType="none"
                statusBarTranslucent
                onRequestClose={close}
            >
                <View style={styles.modalRoot}>
                    {/* Backdrop — semi-transparent scrim; tapping dismisses */}
                    <Pressable
                        style={[StyleSheet.absoluteFill, styles.backdrop]}
                        onPress={close}
                        accessibilityRole="button"
                        accessibilityLabel="Close dropdown"
                    />

                    {/* Panel — a plain View (NOT Pressable) so TextInput
                        gets clean responder access on iOS */}
                    <View style={[styles.overlay, overlayStyle]}>
                        {/* Search */}
                        {search && (
                            <View style={styles.searchContainer}>
                                <TextInput
                                    ref={searchInputRef}
                                    style={styles.searchInput}
                                    placeholder={searchPlaceholder}
                                    placeholderTextColor={colors.textSecondary}
                                    value={searchText}
                                    onChangeText={setSearchText}
                                    autoCorrect={false}
                                    autoCapitalize="none"
                                    autoFocus
                                />
                            </View>
                        )}

                        {/* List */}
                        <FlatList
                            data={filteredData}
                            renderItem={renderItem}
                            keyExtractor={keyExtractor}
                            keyboardShouldPersistTaps="handled"
                            showsVerticalScrollIndicator
                            ListEmptyComponent={
                                <View style={styles.empty}>
                                    <Text style={styles.emptyText}>No results</Text>
                                </View>
                            }
                        />
                    </View>
                </View>
            </Modal>
        </View>
    );
}

/* ------------------------------------------------------------------ */
/*  Exported wrapper (preserves generic type for consumers)            */
/* ------------------------------------------------------------------ */

export default function SearchableDropdown<T>(props: SearchableDropdownProps<T>) {
    return <SearchableDropdownInner {...props} />;
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
    wrapper: {
        width: "100%",
        paddingVertical: spacing.xs,
    },
    floatingLabel: {
        position: "absolute",
        top: 0,
        left: 22,
        zIndex: 999,
        backgroundColor: "white",
        paddingHorizontal: 8,
        fontSize: 14,
        color: colors.primary,
    },
    trigger: {
        height: 50,
        borderColor: colors.primary,
        borderWidth: 1,
        borderRadius: radii.md,
        paddingHorizontal: 12,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: "#fff",
    },
    triggerFocused: {
        borderColor: colors.primary,
        borderWidth: 2,
    },
    triggerDisabled: {
        opacity: 0.5,
    },
    triggerText: {
        flex: 1,
        fontSize: 16,
        color: colors.text,
    },
    triggerPlaceholder: {
        color: colors.primary,
    },
    chevron: {
        fontSize: 12,
        color: colors.textSecondary,
        marginLeft: 8,
    },
    clearButton: {
        marginLeft: 8,
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: colors.border,
        alignItems: "center",
        justifyContent: "center",
    },
    clearButtonText: {
        fontSize: 13,
        color: colors.textSecondary,
        fontWeight: "600",
    },

    /* overlay */
    modalRoot: {
        flex: 1,
    },
    backdrop: {
        backgroundColor: "rgba(0,0,0,0.15)",
    },
    overlay: {
        backgroundColor: "#fff",
        borderRadius: radii.md,
        borderWidth: 1,
        borderColor: colors.border,
        elevation: 8,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        overflow: "hidden",
    },

    /* search */
    searchContainer: {
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    searchInput: {
        height: 40,
        fontSize: 16,
        color: colors.text,
        padding: 0,
    },

    /* list items */
    item: {
        paddingHorizontal: 16,
        paddingVertical: 14,
    },
    itemSelected: {
        backgroundColor: `${colors.primary}15`,
    },
    itemPressed: {
        backgroundColor: `${colors.primary}10`,
    },
    itemText: {
        ...typography.body,
        color: colors.text,
    },
    itemTextSelected: {
        color: colors.primary,
        fontWeight: "600",
    },

    /* empty */
    empty: {
        paddingVertical: 24,
        alignItems: "center",
    },
    emptyText: {
        ...typography.body,
        color: colors.textSecondary,
    },
});
