📘 Project Looma: 架构设计说明书 (v1.0)
定位：一个本地优先 (Local-First)、行为可编程 (Programmable Behavior) 的通用 AI 聊天平台。 核心理念：Platform handles the Heavy Lifting, User defines the Strategy.（平台负责繁重底层，用户定义核心策略）。

1. 系统宏观架构 (System Overview)
   Looma 由三个严格隔离的层次组成：

Layer 1: 宿主平台 (The Host / Electron Main)
* 职责：UI 渲染、数据库读写 (SQLite)、LLM API 客户端、Worker 管理、文件解析与预处理。
* 特性：拥有最高权限，管理生命周期，负责 Token 裁剪与组装。

Layer 2: 策略引擎 (The Strategy Engine / Worker Threads)
* 职责：运行用户编写的 TS 策略文件。
* 用户不需要自定义 types（v1），只用你提供的 SDK 类型。 策略以 ESM export 形式导出 meta / configSchema / hooks
* 进程模型：
  * 长寿命 Worker：每个启用中的策略对应一个持久化的 Worker 线程。
  * 上下文隔离：onInit, onContextBuild, onTurnEnd 等 Hook 均在同一个 Worker 实例中运行，允许策略在内存中缓存轻量状态（如解析后的配置）。
  * 安全性：虽然 Worker 是长寿命的，但每次 Hook 执行仍受严格的 Timeout (超时) 限制。平台可在 Worker 崩溃或卡死时自动重启。

Layer 3: 记忆与摄入系统 (Ingest & Memory System)
* 职责：RAG 索引、向量存储 (sqlite-vec)、多模态资产管理。
* 特性：支持“显式记忆云”与“隐式策略存储”。

对于仓库:
社区写策略、不想他们 clone 整个 Electron App. SDK 需要稳定版本、可独立发布
所以拆成 两仓 + 一个 npm 包（或 monorepo 也行）：
方案（最清晰的开源形态）
1.	主仓：looma（Electron App）
2.	SDK 包：@looma/strategy-sdk（npm package）
3.	策略仓库：looma-strategies（一堆策略 + 模板 + 示例）

其中：
looma 依赖 @looma/strategy-sdk
looma-strategies 也依赖 @looma/strategy-sdk
这样发布 SDK 新版本，策略作者升级即可。

2. 策略系统详解 (Layer 2)
   这是 Looma 的灵魂。用户通过编写单一的 TS 文件来控制 AI 行为。

2.0 数据协议标准 (Data Protocol)
为了支持 Agent 能力，Looma 定义了严格的消息结构，兼容 OpenAI 标准。以下定义只显示重要部分. 实际看数据库以及实际
export interface ToolCall {
id: string;
type: 'function';
function: {
name: string;
arguments: string; // Raw JSON String
};
}

export interface Message {
role: 'system' | 'user' | 'assistant' | 'tool';
content: string | null;     // 允许为 null (当纯调用工具时)
tool_calls?: ToolCall[];    // 存放 LLM 的调用指令
tool_call_id?: string;      // 存放工具结果对应的 ID (role='tool' 时必填)
...
}

export interface ToolDefinition {
type: 'function';
function: {
name: string;
description?: string;
parameters: Record<string, any>; // JSON Schema
};
}


2.1 策略文件结构规范 (The Convention)
采用 "Logic First, Config Last" 的设计模式。

// === 身份定义 (UI 渲染用) ===
export const meta = { name: "Deep Research Agent", // 必填：UI 显示的主标题
description: "自动联网深度搜索，并生成长文报告。", // 必填：副标题/Tooltip
version: "1.0.0", // 选填：显得很专业
icon: "search", // 选填：甚至可以让用户指定一个 Lucide 图标名 };
features: { memoryCloud: false, // 默认 false。设为 true 才会激活记忆云 UI。 }

// 1. 核心钩子函数 (Hooks)
export async function onInit(ctx) { ... }
export async function onContextBuild(ctx) { ... }
export async function onToolCall(ctx, call) { ... }
export async function onTurnEnd(ctx) { ... }
export async function onCleanup(ctx) { ... }

// 2. 错误兜底
export async function onError(ctx, error, phase) { ... }

// 3. 配置定义 (UI Schema) - 必须是静态 JSON 数组，禁止函数
export const configSchema = [ ... ];

2.2 上下文对象标准 (ctx Object Standard)
ctx 是策略与平台通信的唯一桥梁。

TypeScript
interface LoomaContext {
// 1. 本轮用户输入数据 (Read-only)
input: {
text: string
attachments: Array<{
id: string            // assetId (对应 memory_assets 表)
name: string
size: number
ready: boolean
type: 'file' | 'image' | 'audio' | 'video'
mimeType?: string
tokens?: number       // 估算值
}>
}

// 2. 历史记录 (Read-only)
history: {
lastUser(): Message | null // 取最近一条用户消息
lastAssistant(): Message | null // 取最近一条assistant消息
range({ fromEnd, toEnd }): Message[] //左闭右开,从“最近的消息”往前数,返回从旧 → 新,fromEnd > toEnd >= 0.
// recent(n) 等价于 range({ fromEnd: n, toEnd: 0 })
recent(n: number): Message[] // 获取最近 n 条
byTokens(maxTokens: number): Message[] // 获取最近N个Token的消息
asPlainText(msg: Message): string // 返回适合送入LLM/embedding的自然语言文本, 忽略控制字段（tool_calls等），content为null 时返回 ''
// 取的这些消息都是数组, 他们可以用自带的filter进行条件过滤
}

// 3. 当前生成的消息 (onTurnEnd 专用, Read-only) 字段里面的值是蓝图阶段给出的, 具体实现参考已经写的代码
message: {
id: string              // 对应 SQLite messages.id (溯源的关键)
content: string         // 完整拼好的内容
status: 'completed' | 'aborted' | 'error'
toolCalls?: ToolCall[] // 或者 toolCallsCount + names
finishReason?: 'stop' | 'length' | 'tool_calls' | 'error'
model?: { id: string; provider: string }
usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number }
errorCode?: string
}

// 4. 配置与环境 (Read-only) 用户通过 configSchema 在 UI 中填写的、用于“策略行为调节”的配置值集合。
config: Record<string, any>  // 用户填写的配置值, 用来调控策略内参数, 不包含模型参数.

budget: {
maxInputTokens: number      // 用户配置拿
maxOutputTokens: number
reservedTokens: number      // 策略无法控制, 比如平台级System Prompt + 本轮user input + 其他必要协议开销的toekn估算
remainingInputTokens: number // = maxInputTokens - reservedTokens
}

// 能力, 这些都是本轮最终确定的能力
capabilities: {
vision: boolean          // 模型是否支持图像
structuredOutput: boolean // 支持 response_format/json_schema 之类
tools: boolean           // 模型是否支持工具调用
}

// 身份, 用户debug和日志
model: {
id: string
provider: string
}

// 本来要做llm的config参数只读接口. 这个是用户设置的, 先不做, 因为感觉策略应该是通用的.

// 5. 操作接口
slots: SlotsAPI            // 布局引擎 (见 2.5)
tools: ToolsAPI            // 核心能力 (见 3.2)

utils: {
measure(text: string): number // Token 通用估算工具,使用分词器给出近似值,仅供策略做阈值判断,推荐用WASM
now(): number                 // 当前时间戳 (ms), 返回unix epoch ms
uuid(): string;               // 生成唯一的id, 返回uuid v4 字符串
}
}

2.3 生命周期钩子 (Lifecycle Hooks)

注意: 因为有worker, 所以策略文件里的变量只能当作内存级存储而不是永久, 因为worker可能会被杀掉, 所以用tools.state来存储一些自定义状态.

A. onInit(ctx)
* 触发时机：用户在设置页加载该策略时，或 Worker 启动时。
* 作用：初始化状态、订阅事件。非常轻量并且幂等
* 禁止：触发任何高成本操作（例如 ingest 重建、全量 re-index、批量扫描/重写记忆云资产）。
* 原因：worker 可能因崩溃/回收而重启，重启会再次执行 onInit；因此 onInit 不应产生重副作用。

B. onContextBuild(ctx) (核心热路径)
* 触发时机：用户发送消息后，LLM 调用前。
* 上下文状态：ctx.message 为空（Assistant 尚未生成）。附件 ctx.input.attachments 已就绪（至少已入库，大文件可能仍在后台索引）。
* 输出：必须返回包含 Prompt 和 Tools 的对象。prompt必须通过 ctx.slots.render() 返回，禁止直接返回字符串。
  return {
  prompt: ctx.slots.render(),       // { messages: Message[] }
  tools?: ToolDefinition[]          //  定义本轮对话可用的工具
  };
* 超时：严格 5-10 秒。

C.  onToolCall(ctx, call) (工具执行钩子), (V1暂时不弄这个, 工具执行由 Host 的 ToolRegistry 负责（builtin + MCP）)
[现在这一个版本不支持用户在策略文件中自定义工具执行 / 自定义网络访问 / 自定义文件 IO]
* 触发时机：当 LLM 返回 tool_calls 且 Host 成功解析参数决定执行时。
* 职责：执行具体的业务逻辑。
* 参数：call 对象包含 { id, name, args: Record<string, any> }。
* 输出：必须返回 Promise<string> (工具执行结果)。Host 会自动将其封装为 role: 'tool' 消息。
* 错误处理：-  若 Host 解析 LLM 返回的 JSON 参数失败，将自动生成一条错误结果回填模型，提示其修正格式，不会触发此钩子。单次执行超时默认为 30s (可配置)。 若用户点击停止，Host 会发送 AbortSignal，策略应尽量响应中断。

D. onTurnEnd(ctx) (后台任务)
* 触发时机：
  1. LLM 流式输出结束或被中断。
  2. Layer 1 将消息写入 SQLite messages 表，生成 id。
  3. 触发此 Hook。
* 关键逻辑：
  * 必须检查 ctx.message.status。若为 'aborted' 或 'error'，通常应跳过记忆生成。
  * 写入记忆时，必须传入 sourceMessageId: ctx.message.id 以便溯源。

E. onCleanup(ctx)
* 触发时机：策略卸载、被禁用或 App 关闭时。
* 职责：
  * 取消 ctx.bus 订阅。
  * 关闭外部连接。
  * 注意：不负责清理用户数据。若需清理记忆，应提供专门的 UI 按钮调用 tools.memories.clearByStrategy()。

F. onError(ctx, error, phase)
* 参数：phase 指示出错阶段 ('init' | 'context' | 'turnEnd')。
* 作用：根据阶段决定是返回 Fallback Prompt 还是仅记录日志。

2.3.1 Strategy Switch Semantics (Host-owned)
•	当用户在同一对话中从策略 A 切换到策略 B 时，Host 必须按顺序触发：
1.	onCleanup(ctx)（旧策略 A）
2.	切换生效（更新 session/ledger/active strategy id）
3.	onInit(ctx)（新策略 B）
•	若策略切换会导致记忆/索引语义不一致（例如策略启用 memoryCloud，或 ingest/indexing 规则不同），Host 必须弹出决策（UI）：
•	Rebuild：按新策略规则对该对话 scope 内相关资产/记忆重建索引（可前台阻塞或后台任务）
•	Hide（或 Retire）：隐藏/退役旧策略产物，使其不再被新策略检索/展示
•	Later：暂不处理（UI 提示可能导致检索不一致）
•	重要：该弹窗只在“策略切换”触发，不在 worker 重启/复活时触发。

worker 重启语义不等同于策略切换
•	Worker 可能因崩溃、超时、资源回收而重启；重启会导致策略模块重新加载并触发 onInit。
•	Worker 重启不代表策略卸载/切换，不应触发 Rebuild/Hide 决策流程。
•	因此，策略作者不得依赖“worker 永久在线”来保证语义正确；需要持久化的数据必须使用 tools.state / memory 系统落库。

2.4 配置 UI Schema (configSchema)
* 约束：必须是 JSON 可序列化的静态数组。推荐单行紧凑模式.
* 类型支持：boolean, select, string, text, number。
* 作用：策略中可以暴露出一些变量, 然后让用户自行设置, 比如说只保留N条记录这样, 这个和LLM参数配置是两个东西.

2.5 Slots 布局系统 (Prompt Layout Engine)
策略通过声明“槽位”来竞争 Token 预算，而非手动拼接字符串。
actualLimit = Math.min(RemainingBudget, Math.max(minTokens, TotalBudget*maxRatio))

TypeScript
interface SlotsAPI {
/**
* 添加内容到槽位
* @param name 槽位名称 (如 'system', 'rag', 'history')
* @param content 内容
* - string: 自动封装为 { role: 'system' | 'user', content: ... } (取决于位置)
* - Message: 直接使用
* - Message[]: 自动展开 (Spread) 并作为整体参与裁剪
* @param options
* priority?: number; 优先级 (默认0, 越高越不易被剪裁)
* maxRatio?: number; 最大占用总预算的比例 (0.0 - 1.0)
* minRatio?: number; 保底占多大 (0.0 - 1.0), 只有裁剪时用这个保留
* minTokens?: number; 这是一个硬保底, 防止minRatio计算出来过小失去意义, 当minRatio小于minTokens时启用, 然后再做上限夹逼
* position?: number; 排序索引 (越小越靠前, System 强制置顶, 如果有两个一样, 先加的排前面)
* role?: 'system' | 'user' | 'assistant' | 'tool'; 显式指定角色 (用于内容或覆盖原角色), 默认为user如果没设置的话
* trimBehavior?: 'char' | 'message'; 裁剪粒度 ('char'=切字符, 'message'=切条目), 方向都是从旧的开始删
  */
  add(
  name: string,
  content: string | Message | Message[] | null,
  options?: {
  priority?: number;
  maxRatio?: number;
  minRatio?: number;
  minTokens?: number;
  number; position?: number; // 这个设置是自由的, 但是会在文档中加入推荐结构, 是一种文化约定. 不写position就按add顺序, 相同的也是add起来.
  role?: 'system' | 'user' | 'assistant' | 'tool';
  trimBehavior?: 'char' | 'message'
  }
  ): void;

/**
* 渲染最终 Prompt
* 执行管线: 预算计算 -> 裁剪 -> System置顶(允许0或多个) -> 按 position 排序
  */
  render(): { messages: Message[] };
  }


3. 记忆与摄入系统规范 (Ingest & Memory)

3.0 核心原则
Local-First：所有 ingest / memory / vector 数据默认存储在本地 SQLite（含 sqlite-vec）。
Strategy-Agnostic：策略层只表达 “我要 ingest / search”，不参与底层 embedding 模型选择、不参与向量维度等基础设施决策。
Single Embedding Space：同一个 Looma 实例在任一时刻只有一个“全局唯一的 Embedding Profile”作为默认坐标系，避免向量碎片化与不可互通。
Modal Neutrality：除非显式选择多模态向量模型，否则所有非文本模态必须先转为文本（caption）再进入 embedding；策略永远不直接处理模态适配问题。

3.1 Ingest 核心规约 (The Blocking Rule)
V1.0 采用 可选阻塞（Wait-Driven Blocking）：是否阻塞由 ingest(..., { wait }) 决定。
•	wait: 'full'（策略显式指定时才用）
•	Host 必须等待本次 ingest 完成 Load/Parse → Process → Chunk → Embed → Write DB（按本次 options 的有效 pipeline）
•	完成后才允许触发本轮 onContextBuild
•	保障：策略不会遇到“刚 ingest 的东西 search 不到”的情况
•	wait: 'load'（默认）
•	Host 只保证资产已入库（memory_assets 可读、附件可展示、可 readAsset）
•	后续 Process/Chunk/Embed 可以后台进行（或由 indexing 选择决定是否进行）
•	ctx.input.attachments[].ready 反映是否已达到本轮策略需要的“可检索/可用”状态（你现在用 boolean 很好）
•	UI 行为
•	wait: 'full'：显示进度条并阻塞到完成
•	wait: 'load'：只显示“已上传/可读”，索引可后台显示为“building index”（如果你未来要做更细状态）

注：wait 只控制 本次 ingest 对 onContextBuild 的阻塞语义，不改变 pipeline 本身；pipeline 仍由 process/chunk/indexing 决定。
3.2 ctx.toopls 概览(与ingest相关)

TypeScript
export interface RunResult {
content: string; // 最终可展示文本（如果中断/报错也尽量给已有内容）
finishReason: 'stop' | 'length' | 'tool_calls' | 'error' | 'aborted';
messages: Message[];        // 全轨迹（含 tool 消息）
toolCalls?: Array<{
id: string;
name: string;
args: Record<string, any>;
status: 'ok' | 'error' | 'aborted';
resultText?: string;
errorMessage?: string;
}>;
usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
error?: { code?: string; message?: string };
}

interface ToolsAPI {
// LLM 调用 (允许策略递归调用模型, 命名空间为llm)
llm: {
call(
messages: Message[],
options?: {
tools?: ToolDefinition[];
toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
temperature?: number
}): Promise<Message>;

    run(options: { 
      messages: Message[]; 
      tools?: ToolDefinition[];
      toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
      maxRounds?: number; // 默认 5，
      onToolCall?: (call: { id: string; name: string; args: Record<string, any> }) => Promise<string>;
      temperature?: number 
    }): Promise<RunResult>;
};

// 变量的存储以及拿取
state: {
/**
* 获取状态
* @param key 键名
* @param scope 作用域
* - 'conversation' (默认), 现在不考虑别的
*/
get<T = any>(key: string, scope?: 'conversation'): Promise<T | null>;
set(key: string, value: any, scope?: 'conversation'): Promise<void>;  // 设置状态 (落库 SQLite)
delete(key: string, scope?: 'conversation'): Promise<void>;   // 删除状态
}

// 还有memory,包含ingest和search, 见后面
}


3.3 ingest pipeline总体流程

所有 ingest（文本/附件/记忆云）最终进入同一管线：

1. Normalize（统一结构）
   文本输入：直接形成 LoadedAsset. 附件：通过 Loader 解析为 LoadedAsset。

2.Chunking（切块）
对 LoadedAsset.text 或 LoadedAsset.sections 进行切块，生成 Chunk[].

3.Embedding（向量化）
使用 全局 Embedding Profile 对每个 chunk 的 text 向量化。结果写入向量表并保留 chunk 原文。

4.Storage（落库）
必须同时落库：
Asset 元信息（来源、mime、hash、策略、会话）
Chunk 原文（用于引用/展示/溯源）
Vector（用于语义检索）


3.4 Loader 系统 (Parsing / Normalization)

Host 必须内置 Loader 处理逻辑，以插件形式存在（Host 提供默认；V1 不开放注册 API，仅预留结构）。

3.4.1 Loader 接口

TypeScript
export interface Loader {
match(ext: string, mimeType?: string): boolean;
load(filePath: string): Promise<LoadedAsset>;
}

3.4.2 LoadedAsset 统一产物

TypeScript
export type AssetModality = 'text' | 'document' | 'image' | 'audio' | 'video';

export interface LoadedAsset {
assetId: string;                // DB 里 memory_assets.id
modality: AssetModality;
mimeType: string;
source: {
fileName?: string;
filePath?: string;
url?: string;
};

// 统一语义载体
text: string;

// 可选：结构化分段
sections?: Array<{
id: string;                   // 稳定 id（用于引用）
title?: string;
page?: number;                // document 可用
startOffset?: number;         // text 偏移（可选）
endOffset?: number;
text: string;
}>;

// 可选：非文本模态的派生文本（例如图片 caption、音频转写）
derived?: {
caption?: string;             // image/video
ocrText?: string;             // image/document（如扫描 PDF）
transcript?: string;          // audio/video
};

// 推荐：用于去重与缓存
hash?: string;                  // sha256(file bytes) 或 sha256(text)
createdAt: number;
}

3.4.3 模态规范（V1 处理规则）

A. Textual 文本模态
.txt / .md / .json / .py / .js
Loader 输出: 直接作为 LoadedAsset.text (原文或者规范化后的纯文本/markdown)
不需要 OCR / caption。

B. Document 文档模态（PDF/Doc/HTML 等）
Loader 输出: 抽文字 + 结构. 写入 LoadedAsset.text (markdown作为统一中间格式)
结构保真要求:
- 必须保留标题层级、段落边界、列表、代码块、引用等基础结构信息（在 Markdown 中体现）。
- 文档内图片/附件不得丢失：应作为子 asset 入库，并在 LoadedAsset 中记录引用关系（例如页码/位置/assetId 列表）。
  表格：优先转为 Markdown 表格文本或 HTML 片段到LoadedAsset.text. 不做细粒度拆碎（避免切断表格结构）。

C. Image 图像模态
默认存原图, 入库asset + 元信息, LoadedAsset.text 允许为空字符串。
可选派生, 通过options: 生成 derived.caption（由模型得到, 为未来ocr留出空间），并将其作为 LoadedAsset.text 的主要内容（或拼接到 text 中）。
说明：V1 不强制使用“图像 embedding”，统一使用 text embedding. 多模态语义检索默认通过 caption → text embedding 实现.

D. Video 视频模态
跟图片一样, 存本地 + meta.


3.5 Chunking 系统 (Splitter)

3.5.1 V1 默认切块器：Recursive Splitter (可被 ingest.options.chunk 覆盖)

适用于所有文本内容.
优先分隔符：\n\n → \n →   → ''(char)

默认参数（Host 全局可配置）：
chunkSizeTokens（400~800）
chunkOverlapTokens（50~120）

TypeScript
export interface Chunk {
id: string;
assetId: string;
sectionId?: string;
page?: number;
text: string;
startOffset?: number;
endOffset?: number;
hash?: string;
}
注意：Chunking 属于 Host 内部能力。策略层不直接实现 splitter，只能通过 ingest options 提供 hint

3.6 Embedding Profile

3.6.1 决策权（关键约束）
Embedding 模型不得由策略决定。
Looma 必须有一套 全局 Embedding Profile（用户在设置里选：云端/本地/不同模型）。
Host 在 ingest / search 时自动附加过滤：WHERE embedding_profile_id = currentProfileId。
切换 profile 后：
旧向量默认不可见（符合预期）；
可提供“重建索引”操作（V1 可不实现 UI，但蓝图需预留）。

3.6.2 Adapter 接口（Host 内部）
TypeScript
export interface EmbeddingAdapter {
id: string;
dimension: number;
embed(texts: string[]): Promise<number[][]>;
}

3.7 ctx.tools.memory API

3.7.1 MemoryHit 结构

TypeScript
// search 返回的
export interface MemoryHit {
id: string;                 // memory record id
similarity: number;              // 相似度0~1,host把距离转换成similarity, similarity 越大越相关）
type: 'text' | 'asset' | 'chunk';   // 命中类型
content: string;            // 用于直接塞进 slots 的可读文本（通常是 chunk.text 或摘要）
assetId?: string;
chunkId?: string;
source: {
strategyId?: string;
conversationId?: string;
sourceMessageId?: string; // 溯源（若来自对话/自动记忆）
page?: number;
sectionId?: string;
};
tags?: string[];
pinned?: boolean;
createdAt: number;
}

// query返回的
export interface MemoryRecord {
id: string;                      // memory_items.id
type: string;                    // memory_items.type
modality: 'text' | 'document' | 'image' | 'audio' | 'video';

// 显示/检索用的短文本（rawOnly 也可以有，比如摘要、标题、用户手写内容）
content?: string | null;         // memory_items.content
text?: string | null;            // memory_items.text_repr

tags?: string[];                 // memory_items.tags(JSON)
meta?: Record<string, any>;      // memory_items.meta(JSON)

// 生命周期
status: 'active' | 'retired';    // 由 retireMemory 控制（V1 二态即可）
ttlAt?: number | null;           // memory_items.ttl_at

// 溯源
source?: {
strategyId: string;            // memory_items.strategy_id
conversationId?: string | null;// memory_items.source_conversation_id
turnId?: string | null;        // memory_items.source_turn_id
messageId?: string | null;     // memory_items.source_message_id
};

// 资产（只有 includeAssets=true 才回填）
assets?: AssetMeta[];

createdAt: number;
updatedAt: number;
}

3.7.2 memory API

Host 默认分流 + 小覆盖
设计哲学（Progressive Disclosure）：
- 新手：只写 ingest(x)，Host 自动完成“模态识别 → 默认 pipeline → 入库”
- 进阶：只在需要时覆盖一两项（process / chunk / storage）
- 高级：一次 ingest 混合附件时，可用 chunk.code/document/media 结构化覆盖，避免策略层写 if/else

TypeScript
// 输入类型
export type IngestInput =
| string
| Message
| File
| { assetId: string } // 引用已上传入库的附件
| Array<string | Message | File | { assetId: string }>;

// ingest 返回值（单个或数组）
export interface IngestResult {
id: string; // memoryId
assetId?: string;
modality: 'text' | 'document' | 'image' | 'audio' | 'video';
status: 'stored' | 'skipped' | 'retired';
indexing: 'full' | 'chunkOnly' | 'rawOnly'; // indexing reflects the effective result
reason?: 'dedup' | 'no_text' | 'index_disabled' | 'unsupported' | 'policy_denied';
// 可选：让策略知道“是否生成了可检索文本”
derived?: {
caption?: boolean;
transcript?: boolean;
ocrText?: boolean;
};
}

// ingest options
export interface IngestOptions {
// 元数据
tags?: string[]; // 任意标签（用于过滤/分组/权限）
type?: string; // 自定义类型
// V1 scpoe 只为 conversation
sourceMessageId?: string; // 溯源（常在 onTurnEnd 用）
dedupKey?: string; // 可选的幂等去重键,如果有的话,host可执行upsert或跳过这次ingest,默认去重策略由host决定
ttlSeconds?: number; // 过期时间（到期可自动 retire）
wait?: 'load' | 'full'

// 预处理（默认都关闭，避免隐性消耗）---
process?: {
image?: {
mode?: 'none' | 'caption'; // 'caption' = 用llm生成描述文本
params?: Record<string, any>;
};

    video?: {
      mode?: 'none' | 'transcribe' | 'caption'; // - transcribe: ASR 逐字稿. // - caption: 对画面做描述（更贵，可选）
      params?: Record<string, any>;
    };

    audio?: {
      mode?: 'none' | 'transcribe'; // V1: 音频只支持转录
      params?: Record<string, any>;
    };

    document?: {
      mode?: 'none' | 'extract'; // 文档默认就是 extract（抽文字+结构 -> markdown）
      params?: Record<string, any>;
    };
};

// 切块（Chunking）, 同样只有“破例/覆盖”才写
chunk?: {
// 全局 hint（对所有“可切块文本”生效：text / document / code / media-derived）
sizeTokens?: number;
overlapTokens?: number;

    // 高级：按“逻辑类别”覆盖（可选）
    // Host 会根据文件后缀/模态路由到对应配置；没填则回退到默认或全局 hint
    // 就是说每一个逻辑类别都有自己的默认sizetokens和overlaptokens, config中可以覆盖
    text?: ChunkConfig; // 普通文本：.txt/.md/.json...
    code?: ChunkConfig; // 代码文本：.py/.js/.ts/.go...
    document?: ChunkConfig; // 文档转出的 markdown/text：.pdf/.docx/.html...
    media?: ChunkConfig; // 仅在图像视频音频产生派生文本时启用, V1先不漏除非有process
};

// 存储/索引策略
indexing?: 'full'|'chunkOnly'|'rawOnly';
indexingByModality?: Partial<Record<
'text' | 'document' | 'image' | 'audio' | 'video',
'full' | 'chunkOnly' | 'rawOnly'
}

export interface ChunkConfig {
splitter?: 'recursive' | 'markdown' | 'token' | 'semantic'; // 切块器“算法类型”
sizeTokens?: number;
overlapTokens?: number;
params?: Record<string, any>; // splitter高级参数(判别联合), 这里最好别用any,类型收紧

// params 内部约定:
// recursive: separators?: string[]; // 默认 ['\n\n', '\n', ' ', '']
// markdown: headerLevels?: number[]; // 默认 [1,2,3,4]
respectCodeBlock?: boolean; // 默认 true
// token: tokenizer?: string; // 'cl100k_base' | 'o200k_base' | host default
// semantic (v1不实现): maxTokens?: number;
similarityThreshold?: number;
windowTokens?: number;
}

export interface MemoryAPI {
// query：结构化查询（非向量）
query(options?: {
// 基础过滤
scope V1 只实现 conversation, 数据库里的scope永远是conversation目前,然后scopeId也是对应的对话id, scope接口不暴露给作者
tags?: string[];                                  // AND 过滤（全部包含）
types?: string[];                                 // type IN (...)
sources?: Array<'implicit' | 'pinned' | 'history' | 'asset'>;

    // 生命周期/状态
    ttl?: 'alive' | 'expired' | 'includeExpired';      // 默认 alive
    status?: Array<'active' | 'retired'>;              // 默认 ['active']

    // 排序与分页
    orderBy?: 'updatedAt' | 'createdAt';               // 默认 updatedAt
    order?: 'desc' | 'asc';                            // 默认 desc
    limit?: number;                                    // 默认 20
    offset?: number;                                   // 默认 0

    // 载入策略
    includeAssets?: boolean;                            // 默认 false（true 会 join 资产元信息）
}): Promise<MemoryRecord[]>;


/**
* 语义检索（默认使用全局 Embedding Profile）
* Host 内部流程：embed(query) -> vector search -> join chunk text -> return hits
  */
  search(
  query: string,
  options?: {
  topK?: number; // 默认 5
  threshold?: number; // (0-1, 1为最相似)默认 0（或 provider 默认）
  tags?: string[]; // tags过滤
  types?: string[]; // type过滤
  // scope现在只做 conversation

  /**
  * 检索来源集合（最核心）
  * - 'implicit'  = 隐式记忆（策略写入但不在记忆云展示）
  * - 'pinned'    = 记忆云（显式记忆）
  * - 'history'   = （可选）对话索引（如果你以后做 onTurnEnd 自动向量化）
  * - 'asset'     = （可选）仅资产派生文本（caption/transcript/ocr）
  *
  * 默认：['implicit', 'pinned']  （等价于“都包括”）
    */
    sources?: Array<'implicit' | 'pinned' | 'history' | 'asset'>;

    }
): Promise<MemoryHit[]>;

/**
* 大一统入口：文本/消息/文件/assetId/数组都能 ingest
* Host 必须实现默认分流：识别模态 -> 默认 loader -> 默认 process -> 默认 chunk -> 默认 embed -> 入库
* options 仅用于“覆盖/破例”
  */
  ingest(input: IngestInput, options?: IngestOptions): Promise<IngestResult | IngestResult[]>;

/**
* 读取资产原文（用于策略引用/分页展示/调试）
  */
  readAsset(assetId: string, options?: { page?: number }): Promise<string>;

/**
* 删除/退役（必须幂等：重复调用不报错）
  */
  retireBySourceMessage(messageId: string): Promise<void>;
  retireMemory(memoryId: string): Promise<void>;
  }

/**
* 注（必须写清楚，避免实现歧义）：
* 1) ingest 不会“执行两遍”：
*    - ingest(x, options) 依然是一次调用；options 只是本次 pipeline 的覆盖参数。
* 2) 若输入是 image/video 且未开启 process.captionImage/transcribeVideo：
*    - 默认仅入库 asset + 元信息（LoadedAsset.text 为空），不会产生可检索向量（storage.index=auto 时也按默认 Profile 决定）。
* 3) Host 必须有一份默认分流 Profile（写在实现里，文档可列出）：
*    - Text/Document/Code：默认 parse+chunk+embed+store
*    - Image/Video：默认只存 asset（不 caption/transcribe）
       */
       1.	明确边界：process 只能产出“用于索引的派生文本”（caption/ocr/transcript/extract），不承诺做业务级总结/解释。
       2.	明确写入位置：派生文本落到 LoadedAsset.derived + LoadedAsset.text，最终进库到 memory_assets.text_repr（或你未来的 chunk 表/asset 表结构里），然后才会被 embed。

3.8 与策略/对话的关系（明确边界，避免误解）

memory.search 默认只检索通过 memory.ingest* 写入的内容与资产索引内容。
对话 history 不默认进入语义索引（避免噪声与重复），若策略需要“对话检索”，应在 onTurnEnd 主动挑选摘要/关键信息写入 memory.ingestText(pinned:false)。
tools.state 是“结构化状态存储”，不参与语义搜索，且与 memory 的目的不同（state = KV，memory = 语义检索）。


4. 兼容性与鲁棒性 (Robustness)

4.1 模型能力降级
* version 降级：
* 当 capabilities.vision === false 时，若策略仍尝试发送图片，Host 必须在发送给 API 前强制移除图片数据（或替换为占位符 [Image: xxx.png]），防止 API 报错。

* Tools降级：
* 若 capabilities.tools === false，Host 应忽略 onContextBuild 返回的 tools 字段，不发送给 API。策略作者应在代码中通过 if (capabilities.tools) 做分支判断，提供纯文本的替代方案。
* 伪结构防御：若模型返回了看似像工具调用的纯文本（如 "I will call search..."），Host 必须将其视为普通文本，严禁尝试解析或执行，除非 Provider 适配器明确返回了标准化的 tool_calls 结构。

4.2 向量模型热切换
* 隔离原则：memories.search 时，Host 必须自动附加 SQL 条件：WHERE model = currentEmbeddingModelId。
* 效果：切换模型后，旧向量暂时不可见（这是符合预期的行为）。

4.3  协议归一化 (Adapter Layer)
* 原则：Looma 内部（Layer 2 & Layer 3）强制使用 OpenAI 兼容格式 (Message / ToolCall)。
* 实现：Layer 1 (Host) 必须在 Provider 适配器层处理不同模型（如 Claude, Gemini）的协议转换，确保 Worker 永远只看到标准化的数据结构。

4.4  执行确定性保障
为了避免竞态条件和调试困难，V1 采用以下严格约束：
1. 串行执行 (Serial Execution)： 当 LLM 一次性返回多个 tool_calls 时，Host 必须按顺序依次执行。 前一个工具完成（或报错）后，才执行下一个。
2. 顺序一致性 (Order Consistency)： 生成的 role: 'tool' 消息必须与 tool_calls 的顺序严格对应。
3. 鲁棒性循环 (Robust Loop)： - 参数解析失败：Host 自动回填 "Error: Invalid JSON arguments"，不中断对话。 - 工具执行报错：Host 捕获 Error，回填 "Error: [ErrorMessage]"，不中断对话。 - 只有当达到 maxRounds 或用户手动停止时，循环才会终止。

Attachment Transport Rule (V1 Hard Requirement)
在 V1 版本中，所有用户上传的附件（包括 document / image / audio / video / file 类型）必须通过模型原生的 file / media 入口发送至 Provider。平台不得自动将附件内容降级为文本拼接进 prompt。(inline_base64 不是“文本拼接”，它仍属于 nativeParts).若当前模型不支持该 MIME 类型或文件尺寸超限，必须在发送前中止并向用户展示明确错误信息。

+ debug系统
+ 消息界面用markdown渲染

补充:
多模态 Token 预算与附件语义补充说明（V1 原则）

Looma 在 V1 版本中采用 严格原生文件接口（Native File API Only）策略：
所有图片 / PDF / 文档 / 音频 / 视频等附件，必须通过模型原生 file 入口发送；不做 prompt 拼接降级处理。若模型不支持对应 MIME 类型，则在发送前阻断并返回明确错误。

在 Token 预算层面：
•	文本部分使用本地 tokenizer 进行精确估算。
•	多模态附件（image / pdf / audio / video）无法精确预估 token 消耗，因此采用保守估算模型（heuristic estimation）。
•	估算结果 + 文本 token 之和，需预留统一安全余量（默认 15%）。
•	若最终仍发生 context_length_exceeded，则由 API 错误兜底并反馈用户。

附件语义规则：
•	当前 turn 上传的附件与该 user message 视为同一个逻辑 turn。
输入框附件选择是一次性的；历史上下文是否携带历史附件由策略代码怎么写来决定
很多provider有远程的file仓库, 所以是否携带 ≠ 是否重新上传（file_id 复用）
•	原生 file 属于“临时挂载语义”，长期记忆必须进入 Memory 层。
有一个provider_file_refs表, 它不是记忆云，也不是策略数据，它是 Host 为了复用远端 file_id 的传输层缓存/映射表。	隔离维度：
•	provider_key（不同 provider / apiHost）
•	account_fingerprint（不同 API key/租户）
•	asset_sha256（内容去重，文件名不重要）

同一对话中切换 provider/model，历史附件如果要继续参与：
•	如果当前 provider 没有对应 file_id 映射：Host 必须从本地 asset bytes 静默重传，拿新 provider 的 file_id
•	这要求本地 asset 在会话存活期/GC 之前不能被物理删除

该设计保证：
•	不破坏策略引擎的 token 裁剪机制。
•	不影响 slots 预算系统。
•	多模态支持与文本策略保持架构解耦。

“transport 不同，预算策略不同”。
•	remote_file_id：不应把文件 bytes 计入 prompt token（最多计一个很小的“引用开销”）
•	inline_base64：会显著占用上下文（尤其图片），必须算进预算（或保守估算）
