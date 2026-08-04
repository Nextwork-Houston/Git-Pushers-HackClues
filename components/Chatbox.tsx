"use client";

import { useRef, useState, useEffect, type FormEvent } from "react";
import { useAppStore } from "@/store/useAppStore";
import { MessageSquare, X, Send } from "lucide-react";

export default function Chatbox() {
  const { messages, addMessage, chatOpen, toggleChat } = useAppStore();
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input when chat opens
  useEffect(() => {
    if (chatOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [chatOpen]);

  const handleSend = (e?: FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text) return;
    addMessage(text, "user");
    setInput("");

    // Simulate a system reply after a short delay
    setTimeout(() => {
      const replies = [
        "Got it! 👋",
        "Thanks for your message!",
        "That's cool!",
        "Click the sprite for a reaction!",
        "Try dragging me around!",
      ];
      addMessage(replies[Math.floor(Math.random() * replies.length)], "system");
    }, 600 + Math.random() * 400);
  };

  if (!chatOpen) {
    return (
      <button
        onClick={toggleChat}
        className="fixed bottom-4 right-4 z-50 w-12 h-12 rounded-full bg-accent text-white flex items-center justify-center shadow-lg hover:bg-accent-hover transition-all duration-200 active:scale-95"
        title="Open chat"
      >
        <MessageSquare size={20} />
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 sm:w-96 h-[420px] flex flex-col bg-bg-card border border-bg-surface rounded-xl shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-bg-surface">
        <span className="text-sm font-medium text-text-primary">Chat</span>
        <button
          onClick={toggleChat}
          className="text-text-secondary hover:text-text-primary transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Messages */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-2"
      >
        {messages.length === 0 && (
          <p className="text-text-secondary text-xs text-center py-8">
            No messages yet. Say hello!
          </p>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] px-3 py-2 rounded-lg text-sm leading-relaxed ${
                msg.sender === "user"
                  ? "bg-accent text-white rounded-br-md"
                  : "bg-bg-surface text-text-primary rounded-bl-md"
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <form
        onSubmit={handleSend}
        className="flex items-center gap-2 px-4 py-3 border-t border-bg-surface"
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 bg-bg-surface text-text-primary text-sm rounded-lg px-3 py-2 placeholder-text-secondary/50 outline-none focus:ring-1 focus:ring-accent/50 transition-shadow"
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="w-8 h-8 rounded-lg bg-accent text-white flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:bg-accent-hover transition-all active:scale-95"
        >
          <Send size={14} />
        </button>
      </form>
    </div>
  );
}