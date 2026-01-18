"use client";

import { socket } from "@/socket";
import { useEffect, useState, useRef } from "react";

type Message = {
  id: string;
  text: string;
  type: "sent" | "received" | "system";
};

export default function Home() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    function onConnect() {
      setIsConnected(true);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          text: `Connected (${socket.id})`,
          type: "system",
        },
      ]);
    }

    function onDisconnect() {
      setIsConnected(false);
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), text: "Disconnected", type: "system" },
      ]);
    }

    function onChatMessage(msg: string) {
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), text: msg, type: "received" },
      ]);
    }

    function onTyping({
      userId,
      isTyping,
    }: {
      userId: string;
      isTyping: boolean;
    }) {
      setTypingUsers((prev) => {
        const next = new Set(prev);
        if (isTyping) {
          next.add(userId);
        } else {
          next.delete(userId);
        }
        return next;
      });
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("chat message", onChatMessage);
    socket.on("typing", onTyping);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("chat message", onChatMessage);
      socket.off("typing", onTyping);
    };
  }, []);

  const handleTyping = () => {
    socket.emit("typing", true);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      socket.emit("typing", false);
    }, 1000);
  };

  console.log(typingUsers);
  const sendMessage = () => {
    if (!input.trim()) return;
    socket.emit("typing", false);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    socket.emit("chat message", input);
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), text: input, type: "sent" },
    ]);
    setInput("");
  };

  return (
    <div className="flex flex-col h-screen bg-zinc-900">
      {/* Header */}
      <div className="p-4 border-b border-zinc-700 flex items-center gap-2">
        <div
          className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`}
        />
        <span className="text-zinc-400 text-sm">
          {isConnected ? "Connected" : "Disconnected"}
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`px-4 py-2 rounded-lg max-w-[70%] ${
              msg.type === "sent"
                ? "bg-blue-600 self-end"
                : msg.type === "received"
                  ? "bg-zinc-700 self-start"
                  : "bg-zinc-800 self-center text-zinc-500 text-sm"
            }`}
          >
            {msg.text}
          </div>
        ))}
      </div>

      {/* Typing indicator */}
      {typingUsers.size > 0 && (
        <div className="px-4 py-2 text-zinc-500 text-sm">
          {typingUsers.size === 1
            ? "Someone is typing..."
            : `${typingUsers.size} people are typing...`}
        </div>
      )}

      {/* Input */}
      <form
        className="p-4 border-t border-zinc-700 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage();
        }}
      >
        <input
          className="flex-1 bg-zinc-800 border border-zinc-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            handleTyping();
          }}
          placeholder="Type a message..."
        />
        <button
          type="submit"
          className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded-lg font-medium"
        >
          Send
        </button>
      </form>
    </div>
  );
}
