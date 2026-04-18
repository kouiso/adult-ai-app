import { beforeEach, describe, expect, it } from "vitest";

import { useChatStore } from "./chat-store";

describe("useChatStore", () => {
  beforeEach(() => {
    useChatStore.setState({
      messages: [],
      isLoading: false,
      currentConversationId: null,
    });
  });

  it("addMessage: メッセージリストに追加される", () => {
    useChatStore.getState().addMessage({
      id: "msg-1",
      role: "user",
      content: "hello",
    });

    const { messages } = useChatStore.getState();
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe("hello");
  });

  it("updateMessage: 指定IDのメッセージが更新される", () => {
    useChatStore.getState().addMessage({
      id: "msg-1",
      role: "assistant",
      content: "",
      isStreaming: true,
    });

    useChatStore.getState().updateMessage("msg-1", "updated content", false);

    const { messages } = useChatStore.getState();
    expect(messages[0].content).toBe("updated content");
    expect(messages[0].isStreaming).toBe(false);
  });

  it("updateMessage: warningLevel を更新できる", () => {
    useChatStore.getState().addMessage({
      id: "msg-warning",
      role: "assistant",
      content: "",
      isStreaming: true,
    });

    useChatStore.getState().updateMessage("msg-warning", "warned content", false, true);

    const { messages } = useChatStore.getState();
    expect(messages[0].warningLevel).toBe(true);
  });

  it("updateMessageImage: 画像URLが設定される", () => {
    useChatStore.getState().addMessage({
      id: "msg-1",
      role: "assistant",
      content: "",
    });

    useChatStore.getState().updateMessageImage("msg-1", "https://example.com/image.png");

    const { messages } = useChatStore.getState();
    expect(messages[0].imageUrl).toBe("https://example.com/image.png");
  });

  it("setLoading: ローディング状態が変更される", () => {
    useChatStore.getState().setLoading(true);
    expect(useChatStore.getState().isLoading).toBe(true);

    useChatStore.getState().setLoading(false);
    expect(useChatStore.getState().isLoading).toBe(false);
  });

  it("setConversationId: 会話IDが設定される", () => {
    useChatStore.getState().setConversationId("conv-123");
    expect(useChatStore.getState().currentConversationId).toBe("conv-123");
  });

  it("clearMessages: メッセージリストがクリアされる", () => {
    useChatStore.getState().addMessage({ id: "msg-1", role: "user", content: "a" });
    useChatStore.getState().addMessage({ id: "msg-2", role: "assistant", content: "b" });

    useChatStore.getState().clearMessages();
    expect(useChatStore.getState().messages).toHaveLength(0);
  });

  it("setMessages: メッセージリスト全体が置き換わる", () => {
    useChatStore.getState().addMessage({ id: "old", role: "user", content: "old" });

    useChatStore.getState().setMessages([
      { id: "new-1", role: "user", content: "new1" },
      { id: "new-2", role: "assistant", content: "new2" },
    ]);

    const { messages } = useChatStore.getState();
    expect(messages).toHaveLength(2);
    expect(messages[0].id).toBe("new-1");
  });
});
