/**
 * Tests for BirdChatModal — rate limiting, input validation, and rendering.
 */

import React from "react";
import { render, fireEvent, screen, waitFor, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import BirdChatModal from "../../components/BirdChatModal";

// Mock dependencies
jest.mock("react-native-safe-area-context", () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockSendChatMessage = jest.fn().mockResolvedValue({
    role: "assistant",
    content: "The Northern Cardinal is a medium-sized songbird.",
});

jest.mock("../../api/birdieApi", () => ({
    sendChatMessage: (...args: unknown[]) => mockSendChatMessage(...args),
    ChatMessage: {},
}));

jest.mock("../../components/MarkdownText", () => {
    const MockMarkdownText = ({ children }: { children: string }) => <span>{children}</span>;
    MockMarkdownText.displayName = "MarkdownText";
    return MockMarkdownText;
});

const mockShowAlert = jest.fn();
jest.mock("../../utils/alert", () => ({
    showAlert: (...args: unknown[]) => mockShowAlert(...args),
}));

const defaultProps = {
    visible: true,
    onClose: jest.fn(),
    commonName: "Northern Cardinal",
};

describe("BirdChatModal", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockSendChatMessage.mockResolvedValue({
            role: "assistant",
            content: "The Northern Cardinal is a medium-sized songbird.",
        });
    });

    describe("rendering", () => {
        it("renders with bird name as header", async () => {
            await act(async () => {
                render(<BirdChatModal {...defaultProps} />);
            });
            expect(screen.getByRole("heading")).toHaveTextContent("Northern Cardinal");
        });

        it("shows AI disclaimer", async () => {
            await act(async () => {
                render(<BirdChatModal {...defaultProps} />);
            });
            expect(screen.getByText("AI-generated · may be incorrect")).toBeInTheDocument();
        });

        it("has Done button to close", async () => {
            const onClose = jest.fn();
            await act(async () => {
                render(<BirdChatModal {...defaultProps} onClose={onClose} />);
            });
            fireEvent.click(screen.getByText("Done"));
            expect(onClose).toHaveBeenCalled();
        });

        it("has Send button", async () => {
            await act(async () => {
                render(<BirdChatModal {...defaultProps} />);
            });
            expect(screen.getByRole("button", { name: "Send message" })).toBeInTheDocument();
        });
    });

    describe("input validation", () => {
        it("does not send empty messages", async () => {
            await act(async () => {
                render(<BirdChatModal {...defaultProps} />);
            });
            // Wait for the auto-fired initial request to complete
            await waitFor(() => {
                expect(mockSendChatMessage).toHaveBeenCalledTimes(1);
            });
            const callCountAfterInit = mockSendChatMessage.mock.calls.length;

            // Click send with empty input
            const sendBtn = screen.getByRole("button", { name: "Send message" });
            fireEvent.click(sendBtn);

            // Should not have sent another message
            expect(mockSendChatMessage.mock.calls.length).toBe(callCountAfterInit);
        });

        it("enforces max message length", async () => {
            await act(async () => {
                render(<BirdChatModal {...defaultProps} />);
            });
            await waitFor(() => {
                expect(mockSendChatMessage).toHaveBeenCalledTimes(1);
            });

            // Type a very long message into the input
            const input = screen.getByPlaceholderText("Ask a follow-up…");
            fireEvent.change(input, { target: { value: "x".repeat(4001) } });

            // Click send
            await act(async () => {
                fireEvent.click(screen.getByRole("button", { name: "Send message" }));
            });

            // Should show alert about length
            expect(mockShowAlert).toHaveBeenCalledWith(
                "Too long",
                expect.stringContaining("4000"),
            );
        });
    });

    describe("accessibility", () => {
        it("has Close chat button", async () => {
            await act(async () => {
                render(<BirdChatModal {...defaultProps} />);
            });
            expect(screen.getByRole("button", { name: "Close chat" })).toBeInTheDocument();
        });

        it("header has heading role", async () => {
            await act(async () => {
                render(<BirdChatModal {...defaultProps} />);
            });
            expect(screen.getByRole("heading")).toBeInTheDocument();
        });
    });
});
