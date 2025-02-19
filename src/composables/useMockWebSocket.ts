import { ref } from 'vue'

// 模拟 WebSocket 状态类型
type WebSocketStatus = 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED'

// 模拟消息类型
interface MockMessage {
  type: 'ai_response' | 'ai_response_end' | 'error'
  content?: string
}

export function useMockWebSocket() {
  const isConnected = ref(false)
  const connectionStatus = ref<WebSocketStatus>('DISCONNECTED')

  // 模拟 AI 响应列表
  const mockResponses = [
    '你好！我能帮你什么吗？',
    '这是一个很有趣的问题。',
    '让我想想...',
    '我明白你的意思了。',
    '需要我详细解释吗？',
  ]

  const connect = async () => {
    connectionStatus.value = 'CONNECTING'

    // 模拟连接延迟
    await new Promise((resolve) => setTimeout(resolve, 1000))

    isConnected.value = true
    connectionStatus.value = 'CONNECTED'
  }

  const send = async (data: Blob) => {
    if (!isConnected.value) {
      throw new Error('WebSocket is not connected')
    }

    // 模拟处理延迟
    await new Promise((resolve) => setTimeout(resolve, 500))

    // 随机选择一个响应
    const response = mockResponses[Math.floor(Math.random() * mockResponses.length)]

    // 模拟消息处理回调
    setTimeout(() => {
      onMessageCallback({
        type: 'ai_response',
        content: response,
      })
    }, 1000)

    // 模拟结束响应
    setTimeout(() => {
      onMessageCallback({
        type: 'ai_response_end',
      })
    }, 2000)
  }

  const close = () => {
    isConnected.value = false
    connectionStatus.value = 'DISCONNECTED'
  }

  // 消息回调函数
  let onMessageCallback: (message: MockMessage) => void = () => {}

  const onMessage = (callback: (message: MockMessage) => void) => {
    onMessageCallback = callback
  }

  return {
    isConnected,
    connectionStatus,
    connect,
    send,
    close,
    onMessage,
  }
}
