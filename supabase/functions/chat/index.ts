import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { messages, context } = body as {
      messages: Array<{ role: string; content: string }>;
      context?: {
        location?: {
          displayName: string;
          fullAddress: string;
          coords?: { lat: number; lng: number } | null;
        };
        travelDate?: string | null;
      };
    };
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // ── 动态构建用户上下文段落 ──
    const contextParts: string[] = [];
    if (context?.location) {
      const loc = context.location;
      if (loc.displayName || loc.fullAddress) {
        const locDetail = loc.fullAddress && loc.fullAddress !== loc.displayName
          ? `${loc.displayName}（${loc.fullAddress}）`
          : loc.displayName || loc.fullAddress;
        contextParts.push(`用户当前位置：${locDetail}`);
      }
      if (loc.coords) {
        contextParts.push(`经纬度：${loc.coords.lat.toFixed(4)}, ${loc.coords.lng.toFixed(4)}`);
      }
    }
    if (context?.travelDate) {
      contextParts.push(`计划出行日期：${context.travelDate}`);
    }

    // 从用户最新消息中提取结构化信息（QuickFillTemplate 拼接的格式）
    const lastUserMsg = messages.filter((m) => m.role === "user").pop()?.content || "";
    const timeMatch = lastUserMsg.match(/出发[：:]\s*(.+?)，\s*返回[：:]\s*(.+?)(?:，|$)/);
    const companionMatch = lastUserMsg.match(/同行[：:](.+?)(?:，|$)/);
    const budgetMatch = lastUserMsg.match(/人均预算(\d+)元/);
    const styleMatch = lastUserMsg.match(/偏好风格[：:](.+?)$/);

    if (timeMatch) contextParts.push(`出行时间段：${timeMatch[1]} ~ ${timeMatch[2]}`);
    if (companionMatch) contextParts.push(`同行人员：${companionMatch[1]}`);
    if (budgetMatch) contextParts.push(`人均预算：¥${budgetMatch[1]}`);
    if (styleMatch) contextParts.push(`偏好风格：${styleMatch[1]}`);

    // ── 组装 system prompt（静态模板 + 动态上下文）──
    const contextBlock = contextParts.length > 0
      ? `\n\n【用户上下文信息 — 推荐时必须严格参考】\n${contextParts.map((p) => `- ${p}`).join("\n")}\n\n推荐原则：\n1. 所有推荐的景点/餐厅/活动必须在用户当前位置附近或合理交通范围内（优先步行/短途可达）\n2. 时间安排必须符合用户的出行时间段\n3. 预算和人数必须匹配用户设定\n4. 如果用户位置明确，优先推荐该城市/区域的真实地点\n5. 不要推荐距离过远或不切实际的方案`
      : "";

    const systemPrompt = `你是"周末喵"，一只会规划周末出行的小猫咪助手。你可以通过 Google 搜索获取最新的景点、餐厅、活动信息，确保推荐内容真实且时效准确。你需要把行程规划输出成一篇杂志风格的攻略文章，让用户一眼就想收藏。${contextBlock}

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
6. 如果用户只问一句话简单问题（不是规划行程），就正常对话回答，不用套这个模板`;

    // 判断是否是行程规划类请求，行程规划才开启联网搜索
    const lastMsg = messages.filter((m) => m.role === "user").pop()?.content || "";
    const isItineraryRequest =
      /行程|景点|去哪|路线|规划|推荐|餐厅|酒店|攻略|周末|玩|游/.test(lastMsg);

    const requestBody: Record<string, unknown> = {
      model: "google/gemini-2.5-flash-preview",
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        ...messages,
      ],
      stream: true,
    };

    // 行程规划时启用 Google Search grounding（Gemini 原生联网）
    if (isItineraryRequest) {
      requestBody.tools = [{ googleSearch: {} }];
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
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
