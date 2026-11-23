import { afterEach, describe, it, expect, vi } from "vitest";
import {
  chat,
  chatOllama,
  chatOpenAI,
  generateWithLLM,
  defaultModels,
  normalizeProviderBaseUrl,
  parseAIOutput,
  ruleSuggestion,
  testProvider,
} from "../ai";
import { testBlock } from "./fixtures";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const provider = () => ({ ...defaultModels()[1], timeout_ms: 100 });
const ollamaProvider = () => ({ ...defaultModels()[0], timeout_ms: 100 });
const response = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }));

function streamResponse(chunks: string[], contentType = "text/event-stream") {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": contentType },
  });
}
describe("AI 请求与事实保护", () => {
  it("鉴权错误保留 HTTP 原因且不重复请求", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("secret-server-detail", { status: 401 }));
    vi.stubGlobal("fetch", fetch);
    await expect(generateWithLLM(provider(), "polish", testBlock(), "", null)).rejects.toThrow("HTTP 401");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("网络错误不被改写为 JSON 校验失败", async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch")); vi.stubGlobal("fetch", fetch);
    await expect(generateWithLLM(provider(), "polish", testBlock(), "", null)).rejects.toThrow("Failed to fetch");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("只有模型输出格式错误才重试一次", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response("not JSON"))
      .mockResolvedValueOnce(response('{"suggested_block":{"title":"修改"},"explanation":"测试"}'));
    vi.stubGlobal("fetch", fetch);
    expect((await generateWithLLM(provider(), "polish", testBlock(), "", null)).suggested_block.title).toBe("修改");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("响应正文尚未读完时超时仍会中止请求", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url, init) => {
      signal = init.signal;
      return Promise.resolve({ ok: true, json: () => new Promise((_resolve, reject) =>
        signal?.addEventListener("abort", () => reject(new DOMException("timeout", "AbortError")))) });
    }));
    const result = generateWithLLM(provider(), "polish", testBlock(), "", null);
    const assertion = expect(result).rejects.toThrow("timeout");
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
    expect(signal?.aborted).toBe(true);
  });
  it("润色保留职责强度和估算限定词", () => {
    const block = { ...testBlock(), bullets: ["负责约 20 人的服务，耗时降低 30% 左右", "参与了大概 3 个项目"] };
    const result = ruleSuggestion("polish", block, []);
    expect(result.suggested_block.bullets).toEqual(["负责约 20 人的服务，耗时降低 30% 左右", "参与大概 3 个项目"]);
  });
});

describe("流式输出（Ollama NDJSON & OpenAI SSE）", () => {
  it("chatOllama 支持流式读取分段 NDJSON 并触发 onChunk / onProgress", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse(
        [
          '{"message":{"content":"{\\"suggested_block\\":"},"done":false}\n{"message":{"con',
          'tent":"{\\"title\\":\\"架构师\\"},"},"done":false}\n',
          '{"message":{"content":"\\"explanation\\":\\"ok\\"}"},"done":true}\n',
        ],
        "application/x-ndjson"
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const chunks: Array<[string, string]> = [];
    const progress: string[] = [];
    const out = await chatOllama(
      ollamaProvider(),
      [{ role: "user", content: "hi" }],
      {
        stream: true,
        onChunk: (delta, acc) => chunks.push([delta, acc]),
        onProgress: (acc) => progress.push(acc),
      }
    );

    expect(out).toBe('{"suggested_block":{"title":"架构师"},"explanation":"ok"}');
    expect(chunks).toEqual([
      ['{"suggested_block":', '{"suggested_block":'],
      ['{"title":"架构师"},', '{"suggested_block":{"title":"架构师"},'],
      ['"explanation":"ok"}', '{"suggested_block":{"title":"架构师"},"explanation":"ok"}'],
    ]);
    expect(progress).toHaveLength(3);
    const reqBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(reqBody.stream).toBe(true);
  });

  it("chatOpenAI 支持流式读取 SSE 并忽略 [DONE] 与空行", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse([
        ': keep-alive\n\ndata: {"choices":[{"delta":{"content":"{\\"suggested"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"_block\\":{},\\"explanation\\":\\"流式\\"}"}}]}\n\ndata: [DONE]\n\n',
      ])
    );
    vi.stubGlobal("fetch", fetchMock);

    const chunks: string[] = [];
    const out = await chatOpenAI(
      provider(),
      [{ role: "user", content: "hi" }],
      { onChunk: (delta) => chunks.push(delta) }
    );

    expect(out).toBe('{"suggested_block":{},"explanation":"流式"}');
    expect(chunks).toEqual([
      '{"suggested',
      '_block":{},"explanation":"流式"}',
    ]);
    const reqBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(reqBody.stream).toBe(true);
  });

  it("chat 与 generateWithLLM 支持流式回调并保留 JSON 校验与重试", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        streamResponse([
          'data: {"choices":[{"delta":{"content":"not json"}}]}\n\n',
          "data: [DONE]\n\n",
        ])
      )
      .mockResolvedValueOnce(
        streamResponse([
          'data: {"choices":[{"delta":{"content":"{\\"suggested_block\\":{\\"title\\":\\"重试成功\\"},"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"\\"explanation\\":\\"ok\\"}"}}]}\n\ndata: [DONE]\n\n',
        ])
      );
    vi.stubGlobal("fetch", fetchMock);

    const progress: string[] = [];
    const out = await generateWithLLM(
      provider(),
      "polish",
      testBlock(),
      "",
      null,
      {
        stream: true,
        onProgress: (acc) => progress.push(acc),
      }
    );

    expect(out.suggested_block.title).toBe("重试成功");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(progress[progress.length - 1]).toContain("重试成功");
  });

  it("chat 兼容直接传入 AbortSignal 的旧调用方式", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    const ctrl = new AbortController();
    const out = await chat(provider(), [{ role: "user", content: "hi" }], ctrl.signal);
    expect(out).toBe("ok");
    const reqBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(reqBody.stream).toBeUndefined();
  });

  it("流式读取超时时会中止请求", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url, init) => {
        signal = init.signal;
        const body = new ReadableStream<Uint8Array>({
          start() {
            // Never enqueue or close; rely on timeout abort.
          },
        });
        return Promise.resolve(
          new Response(body, {
            status: 200,
            headers: { "Content-Type": "text/event-stream" },
          })
        );
      })
    );

    const p = chatOpenAI(provider(), [{ role: "user", content: "hi" }], {
      stream: true,
    });
    const assertion = expect(p).rejects.toThrow(/timeout|abort/i);
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
    expect(signal?.aborted).toBe(true);
  });
});

describe("testProvider：连接诊断", () => {
  it("Ollama 发现目标模型时返回 ok 与模型列表", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ models: [{ name: "qwen2.5:7b" }, { name: "llama3:8b" }] }),
          { status: 200 }
        )
      )
    );
    const res = await testProvider(ollamaProvider());
    expect(res.ok).toBe(true);
    expect(res.code).toBe("ok");
    expect(res.availableModels).toEqual(["qwen2.5:7b", "llama3:8b"]);
  });

  it("Ollama 未找到模型时返回 model_not_found 并列出可用模型", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ models: [{ name: "llama3:8b" }, { name: "mistral:7b" }] }),
          { status: 200 }
        )
      )
    );
    const res = await testProvider(ollamaProvider());
    expect(res.ok).toBe(false);
    expect(res.code).toBe("model_not_found");
    expect(res.availableModels).toEqual(["llama3:8b", "mistral:7b"]);
    expect(res.message).toContain("llama3:8b");
    expect(res.hint).toContain("ollama pull");
  });

  it("401/403 诊断为 auth_error 并提示检查 API Key", async () => {
    for (const status of [401, 403]) {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response("unauthorized", { status }))
      );
      const res = await testProvider(provider());
      expect(res.ok).toBe(false);
      expect(res.code).toBe("auth_error");
      expect(res.message).toContain("API Key");
      expect(res.message).toContain(String(status));
    }
  });

  it("404 诊断为 model_not_found", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("not found", { status: 404 }))
    );
    const res = await testProvider(provider());
    expect(res.ok).toBe(false);
    expect(res.code).toBe("model_not_found");
    expect(res.message).toContain("404");
  });

  it("OpenAI /models 返回列表但缺少目标模型时返回 model_not_found", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ data: [{ id: "gpt-4o" }, { id: "gpt-4.1" }] }),
          { status: 200 }
        )
      )
    );
    const res = await testProvider(provider());
    expect(res.ok).toBe(false);
    expect(res.code).toBe("model_not_found");
    expect(res.availableModels).toEqual(["gpt-4o", "gpt-4.1"]);
  });

  it("CORS / 网络拦截 (TypeError) 对 Ollama 给出 OLLAMA_ORIGINS 指导", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const res = await testProvider(ollamaProvider());
    expect(res.ok).toBe(false);
    expect(res.code).toBe("cors_or_network");
    expect(res.message).toContain("CORS");
    expect(res.hint).toContain("OLLAMA_ORIGINS");
  });

  it("CORS / 网络拦截对外部 OpenAI 服务给出跨域/代理指导", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const res = await testProvider(provider());
    expect(res.ok).toBe(false);
    expect(res.code).toBe("cors_or_network");
    expect(res.hint).toContain("CORS");
  });

  it("超时诊断为 timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn((_url, init) => {
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        });
      })
    );
    const p = testProvider(provider());
    await vi.advanceTimersByTimeAsync(100);
    const res = await p;
    expect(res.ok).toBe(false);
    expect(res.code).toBe("timeout");
    expect(res.message).toContain("超时");
  });

  it("LM Studio /api/v1 地址自动归一化为 /v1，且在 HTTP 400 时自动降级去掉 response_format 重试 + 剥离 <think> 思考块", async () => {
    expect(
      normalizeProviderBaseUrl("http://localhost:1234/api/v1", "openai_compatible")
    ).toBe("http://localhost:1234/v1");
    expect(
      normalizeProviderBaseUrl("http://localhost:1234", "openai_compatible")
    ).toBe("http://localhost:1234/v1");

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('{"error":"response_format.type must be json_schema or text"}', {
          status: 400,
        })
      )
      .mockResolvedValueOnce(
        response(
          '<think>思考如何润色...</think>\n{"suggested_block":{"title":"LM Studio 成功"},"explanation":"已完成本地润色"}'
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const lmProvider = {
      ...provider(),
      type: "local" as const,
      base_url: "http://localhost:1234/api/v1",
      model_name: "qwen/qwen3.5-9b",
    };
    const out = await generateWithLLM(lmProvider, "polish", testBlock(), "", null);
    expect(out.suggested_block.title).toBe("LM Studio 成功");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:1234/v1/chat/completions");
    const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(firstBody.response_format).toEqual({ type: "json_object" });
    expect(secondBody.response_format.type).toBe("json_schema");

    // 验证思考过程中带有花括号 + 尾随逗号的文本也能精准提取最后一个 JSON 对象
    const noisy = parseAIOutput(
      'Thinking Process: 1. Input has {"old": 1} in text.\nHere is the result:\n{"suggested_block":{"title":"Ok","bullets":["a",],},"explanation":"done",}',
      testBlock()
    );
    expect(noisy.suggested_block.title).toBe("Ok");
    expect(noisy.suggested_block.bullets).toEqual(["a"]);
  });
});
