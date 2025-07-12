import React, { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import '../styles/chatbot.css';

export interface ChatBotProps {
  serverUrl: string;
  token: string;
  theme?: 'light' | 'dark';
}

interface Message {
  from: 'user' | 'bot';
  text: string;
}

export const ChatBot: React.FC<ChatBotProps> = ({ serverUrl, token, theme = 'light' }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const socketRef = useRef<Socket | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const socket = io(serverUrl, { auth: { token } });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('connected');
    });

    socket.on('chat_update', (data: { message: string }) => {
      setMessages((msgs) => [...msgs, { from: 'bot', text: data.message }]);
    });

    return () => {
      socket.disconnect();
    };
  }, [serverUrl, token]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = () => {
    if (!input.trim()) return;
    setMessages((msgs) => [...msgs, { from: 'user', text: input }]);
    socketRef.current?.emit('chat_message', { message: input, authToken: token });
    setInput('');
  };

  return (
    <div className={`mcp-chatbot mcp-${theme}`}>      
      <div className="mcp-chat-messages">
        {messages.map((m, idx) => (
          <div key={idx} className={`mcp-msg mcp-msg-${m.from}`}>{m.text}</div>
        ))}
        <div ref={chatEndRef} />
      </div>
      <div className="mcp-chat-input">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Type a message"
        />
        <button onClick={sendMessage}>Send</button>
      </div>
    </div>
  );
};
