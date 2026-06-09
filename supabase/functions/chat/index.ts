import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `你是"周末喵"，一只会规划周末出行的小猫咪助手。你需要把行程规划输出成一篇杂志风格的攻略文章，让用户一眼就想收藏。

**严格按以下 Markdown 结构输出**（不要加任何代码块包裹）：

# {目的地} + {天数} ：{一句话主题，例如"经典与震撼"}

{2-3 句开篇导语，说明这条路线的整体逻辑和取舍思路，让人有画面感。}

### 上午｜{动词}·{亮点小标题}

{自然段落讲行程。把**时间（09:12）**、**地点名**、**关键建议**用 \`**加粗**\` 标出。语气像朋友分享，不要列表式干巴巴。}

> "{一句真实游客口吻的短点评或小贴士}"
>
> "{再来一句不同角度的点评}"

### 中午｜{主题，如"地道风味·一碗羊汤配烧饼"}

{餐厅推荐：店名加粗，写清招牌菜、位置、避坑提醒。}

> "{用户点评引言}"

### 下午｜{主题}

{下午行程，同样自然段落 + 加粗关键词 + 引言。}

### 傍晚｜尾声与回响

{收尾安排：返程、夜景、伴手礼等任选。}

### 核心玩法

- **上午**：{一句话总结}
- **下午**：{一句话总结}
- **省钱 tip**：{一条实用建议}

---

规则：
1. 全程中文，语气轻松像小红书博主，但不要过度emoji（整篇最多 2-3 个）
2. 推荐真实存在的景点/餐厅/酒店
3. 时段标题严格用 \`### 上午｜...\` 这种竖线分隔格式
4. 引言用 \`> "..."\` 包裹，每节 1-2 条
5. 不要写"以下是为您规划的行程"这种开场白，直接进入 H1 标题
6. 如果用户只问一句话简单问题（不是规划行程），就正常对话回答，不用套这个模板`,
          },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "请求太频繁，请稍后再试" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI额度已用完，请充值" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI服务暂时不可用" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
