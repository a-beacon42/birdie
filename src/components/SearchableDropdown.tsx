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
    Dimensions,
    Keyboard,
    Platform,
    type LayoutRectangle,
    type ListRenderItemInfo,
} from "react-native";
import { colors, spacing, radii, typography } from "../theme";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

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
    value: any;
    /** Called when the user selects an item */
    onChange: (item: T) => void;
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
        () => data.find((d) => (d as any)[valueField] === value) ?? null,
        [data, value, valueField],
    );

    const displayText = selectedItem
        ? String((selectedItem as any)[labelField])
        : placeholder;

    const filteredData = useMemo(() => {
        if (!searchText) return data;
        const lower = searchText.toLowerCase();
        return data.filter((item) =>
            String((item as any)[labelField]).toLowerCase().includes(lower),
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
            const itemValue = (item as any)[valueField];
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
                        {String((item as any)[labelField])}
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

    const screenH = Dimensions.get("window").height;
    let overlayStyle: any = {};
    if (anchorLayout) {
        const top = anchorLayout.y + anchorLayout.height + 4;
        const visibleBottom = screenH - keyboardHeight;
        const availableBelow = visibleBottom - top - 16;
        const dropdownHeight = Math.min(maxHeight, availableBelow > 120 ? availableBelow : maxHeight);
        const showAbove = availableBelow < 120;

        overlayStyle = {
            position: "absolute" as const,
            left: anchorLayout.x,
            width: anchorLayout.width,
            maxHeight: dropdownHeight,
            ...(showAbove
                ? { bottom: screenH - anchorLayout.y + 4 }
                : { top }),
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
                <Text style={styles.chevron}>{visible ? "▲" : "▼"}</Text>
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
