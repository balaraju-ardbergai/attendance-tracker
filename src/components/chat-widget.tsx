"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, MessageCircle, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client";

type Msg = { role: "user" | "bot"; text: string };

const SUGGESTIONS = [
  "Where am I at the Claude certification?",
  "Did I mark attendance today?",
  "My pending requests",
  "My open tasks",
  "My team",
];

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "bot",
      text: "Hi! I'm your Org Tracker assistant. Ask me about your attendance, courses, tasks, requests, team or expenses — I only see what you can see.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, open]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setMessages((prev) => [...prev, { role: "user", text: message }]);
    setInput("");
    setBusy(true);
    try {
      const data = await api<{ reply: string }>("/api/assistant", {
        method: "POST",
        body: JSON.stringify({ message }),
      });
      setMessages((prev) => [...prev, { role: "bot", text: data.reply }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "bot", text: err instanceof Error ? err.message : "Something went wrong." },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* Launcher */}
      <Button
        size="icon"
        className="fixed bottom-5 right-5 z-50 h-12 w-12 rounded-full shadow-lg"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close assistant" : "Open assistant"}
      >
        {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
      </Button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-20 right-5 z-50 flex h-[480px] w-[360px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-xl border bg-card shadow-2xl">
          <div className="flex items-center gap-2 border-b bg-muted/50 px-4 py-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Bot className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold leading-tight">Org Tracker Assistant</p>
              <p className="text-[11px] text-muted-foreground">Answers from your own data</p>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-3">
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={
                    m.role === "user"
                      ? "max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground"
                      : "max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm"
                  }
                >
                  {m.text}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm text-muted-foreground">Thinking…</div>
              </div>
            )}
          </div>

          {messages.length <= 1 && (
            <div className="flex flex-wrap gap-1.5 px-3 pb-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  className="rounded-full border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  onClick={() => void send(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          <form
            className="flex items-center gap-2 border-t p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your account…"
              className="h-9"
            />
            <Button type="submit" size="icon" className="h-9 w-9 shrink-0" disabled={busy || !input.trim()} aria-label="Send">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      )}
    </>
  );
}
