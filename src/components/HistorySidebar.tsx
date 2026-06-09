import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Settings, MessageSquarePlus, Trash2 } from "lucide-react";
import {
  listConversations,
  groupByTime,
  deleteConversation,
  type ConversationRow,
} from "@/lib/chatHistory";

interface HistorySidebarProps {
  open: boolean;
  onClose: () => void;
  onSelectChat: (id: string) => void;
  onNewChat?: () => void;
  currentLocationName: string;
  onLocationClick: () => void;
  refreshKey?: number;
  activeConversationId?: string | null;
}

const SIDEBAR_WIDTH = "78%";

const HistorySidebar = ({
  open,
  onClose,
  onSelectChat,
  onNewChat,
  refreshKey,
  activeConversationId,
}: HistorySidebarProps) => {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const items = await listConversations();
    setConversations(items);
    setLoading(false);
  };

  useEffect(() => {
    if (open) fetchData();
  }, [open, refreshKey]);

  const filtered = searchQuery.trim()
    ? conversations.filter((c) =>
        c.title.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : conversations;

  const groups = groupByTime(filtered);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("删除这条对话？")) return;
    await deleteConversation(id);
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeConversationId === id) onNewChat?.();
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 z-[65]"
            style={{ background: "rgba(0,0,0,0.18)" }}
            onClick={onClose}
          />

          <motion.div
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 32 }}
            className="absolute top-0 left-0 z-[70] h-full bg-background flex flex-col shadow-2xl"
            style={{ width: SIDEBAR_WIDTH }}
          >
            <div className="shrink-0 flex items-center justify-between px-4 pt-11 pb-3 bg-background">
              <h1 className="text-[22px] font-bold tracking-tight">周末喵</h1>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setSearchOpen((v) => !v)}
                  className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted/70 active:bg-muted transition-colors"
                  aria-label="搜索"
                >
                  <Search className="w-[18px] h-[18px] text-foreground/80" />
                </button>
                <button
                  className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted/70 active:bg-muted transition-colors"
                  aria-label="设置"
                >
                  <Settings className="w-[18px] h-[18px] text-foreground/80" />
                </button>
              </div>
            </div>

            <div className="shrink-0 px-4 pt-1 pb-3">
              <button
                onClick={() => {
                  onNewChat?.();
                  onClose();
                }}
                className="w-full h-12 rounded-full flex items-center justify-center gap-2 bg-muted/70 hover:bg-muted active:scale-[0.99] transition-all text-foreground"
              >
                <MessageSquarePlus className="w-[18px] h-[18px]" />
                <span className="text-[15px] font-semibold">新建对话</span>
              </button>
            </div>

            <AnimatePresence initial={false}>
              {searchOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="shrink-0 overflow-hidden px-4"
                >
                  <input
                    autoFocus
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="搜索对话…"
                    className="w-full h-10 px-4 mb-2 rounded-xl bg-muted border border-border/50 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/25"
                  />
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex-1 overflow-y-auto scrollbar-hide">
              {loading && conversations.length === 0 && (
                <p className="text-sm text-muted-foreground text-center pt-10">加载中…</p>
              )}
              {!loading && groups.length === 0 && (
                <p className="text-sm text-muted-foreground text-center pt-10">
                  {searchQuery.trim() ? "没有找到相关对话" : "还没有历史对话"}
                </p>
              )}

              {groups.map((group) => (
                <div key={group.label}>
                  <div className="flex items-center justify-between px-5 pt-4 pb-1.5">
                    <span className="text-xs text-muted-foreground">{group.label}</span>
                  </div>
                  <div>
                    {group.items.map((item) => {
                      const active = activeConversationId === item.id;
                      return (
                        <div
                          key={item.id}
                          onClick={() => {
                            onSelectChat(item.id);
                            onClose();
                          }}
                          className={`group w-full text-left px-4 py-3 flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                            active ? "bg-muted/70 rounded-xl" : "hover:bg-muted/40"
                          }`}
                        >
                          <p className="text-sm font-medium truncate pr-2 flex-1">{item.title}</p>
                          <button
                            onClick={(e) => handleDelete(e, item.id)}
                            className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-full flex items-center justify-center hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                            aria-label="删除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div className="h-6" />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default HistorySidebar;
