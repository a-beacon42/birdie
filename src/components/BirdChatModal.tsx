import React, { useEffect, useState } from 'react';
import { SafeAreaView, Modal, View, Text, FlatList, TextInput, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { ChatMessage, sendBirdChatMessage } from '../services/BirdChatService';

interface BirdChatModalProps {
    visible: boolean;
    onClose: () => void;
    commonName: string;
}

const BirdChatModal: React.FC<BirdChatModalProps> = ({ visible, onClose, commonName }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');

    useEffect(() => {
        if (visible) {
            const initConversation = async () => {
                const systemMsg: ChatMessage = { role: 'system', content: 'You are an expert ornithologist who specializes in field identification. You answer questions concisely & factually -- if you are not absolutely sure of something, do not include it in your response. You only answer questions about birds. If asked about anything else, politely reply that the topic is outside your area of expertise. focus on: key morphological features, habitat & range, & behavior. If there are common lookalikes, include how to tell them apart. You **MUST** limit responses to 150 words or fewer.' };
                const userMsg: ChatMessage = { role: 'user', content: `What are the key identifiers for ${commonName}?` };
                setMessages([systemMsg, userMsg]);
                try {
                    const reply = await sendBirdChatMessage([systemMsg, userMsg]);
                    setMessages([systemMsg, userMsg, reply]);
                } catch (err) {
                    console.error(err);
                }
            };
            initConversation();
        } else {
            setMessages([]);
            setInput('');
        }
    }, [visible, commonName]);

    const handleSend = async () => {
        if (!input.trim()) return;
        const newUserMsg: ChatMessage = { role: 'user', content: input.trim() };
        const convo = [...messages, newUserMsg];
        setMessages(convo);
        setInput('');
        try {
            const reply = await sendBirdChatMessage(convo);
            setMessages([...convo, reply]);
        } catch (err) {
            console.error(err);
        }
    };

    const msgsToRender = messages.filter(msg => msg.role === 'user' || msg.role === 'assistant');

    const renderItem = ({ item }: { item: ChatMessage }) => (
        <View style={item.role === 'user' ? styles.userMsg : styles.assistantMsg}>
            <Text>{item.content}</Text>
        </View>
    );

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
            <SafeAreaView style={styles.safeArea}>
                <Text style={styles.aiContentWarning}>AI-generated content may be incorrect.</Text>
                <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                    <Text style={styles.closeText}>Close</Text>
                </TouchableOpacity>
                <FlatList
                    inverted
                    data={[...msgsToRender].reverse()}
                    keyExtractor={(_, idx) => idx.toString()}
                    renderItem={renderItem}
                    contentContainerStyle={styles.messagesContainer}
                />
                <View style={styles.inputContainer}>
                    <TextInput
                        value={input}
                        onChangeText={setInput}
                        style={styles.input}
                        placeholder="Type your message..."
                    />
                    <TouchableOpacity onPress={handleSend} disabled={!input.trim()} >
                        <Image
                            source={require('../../assets/send-icon.png')}
                            style={styles.sendButton}
                        />
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        </Modal>
    );
};

export default BirdChatModal;

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#fff',
        alignItems: "center",
        justifyContent: "center",
        padding: 10,
    },
    closeButton: {
        alignSelf: 'flex-end',
        padding: 10,
    },
    sendButton: {
        width: 40,
        height: 40,
    },
    closeText: {
        fontSize: 16,
        color: '#007AFF',
    },
    aiContentWarning: {
        backgroundColor: 'rgba(0,0,0,0.5)',
        color: '#fff',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        fontSize: 12,
        fontWeight: 'bold',
    },
    messagesContainer: {
        flexGrow: 1,
        paddingVertical: 10,
    },
    userMsg: {
        alignSelf: 'flex-end',
        backgroundColor: '#DCF8C6',
        borderRadius: 15,
        padding: 8,
        marginVertical: 4,
        maxWidth: '80%',
    },
    assistantMsg: {
        alignSelf: 'flex-start',
        backgroundColor: '#E5E5EA',
        borderRadius: 15,
        padding: 8,
        marginVertical: 4,
        maxWidth: '80%',
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        borderTopWidth: 1,
        borderColor: '#ccc',
        paddingVertical: 6,
        paddingHorizontal: 10,
    },
    input: {
        flex: 1,
        marginRight: 8,
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 20,
        paddingHorizontal: 12,
        height: 40,
    },
});