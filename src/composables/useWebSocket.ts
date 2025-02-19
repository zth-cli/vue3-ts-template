import { ref, onUnmounted } from 'vue'

type WebSocketStatus = 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED'

interface WebSocketOptions {
  onMessage?: (event: MessageEvent) => void
  onError?: (event: Event) => void
  autoReconnect?: boolean
  reconnectAttempts?: number
  reconnectInterval?: number
}

export function useWebSocket(url: string, options: WebSocketOptions = {}) {
  const { onMessage, onError, autoReconnect = true, reconnectAttempts = 5, reconnectInterval = 3000 } = options

  const ws = ref<WebSocket | null>(null)
  const isConnected = ref(false)
  const connectionStatus = ref<WebSocketStatus>('DISCONNECTED')
  let reconnectCount = 0
  let reconnectTimer: number | null = null

  const connect = async () => {
    try {
      if (ws.value?.readyState === WebSocket.OPEN) return

      connectionStatus.value = 'CONNECTING'

      return new Promise<void>((resolve, reject) => {
        ws.value = new WebSocket(url)

        ws.value.onopen = () => {
          isConnected.value = true
          connectionStatus.value = 'CONNECTED'
          reconnectCount = 0
          resolve()
        }

        ws.value.onclose = () => {
          isConnected.value = false
          connectionStatus.value = 'DISCONNECTED'
          handleReconnect()
        }

        ws.value.onerror = (event) => {
          onError?.(event)
          reject(new Error('WebSocket connection failed'))
        }

        ws.value.onmessage = onMessage || (() => {})
      })
    } catch (error) {
      handleReconnect()
      throw error
    }
  }

  const handleReconnect = () => {
    if (!autoReconnect || reconnectCount >= reconnectAttempts) return

    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
    }

    reconnectTimer = window.setTimeout(() => {
      reconnectCount++
      connect()
    }, reconnectInterval)
  }

  const send = async (data: string | ArrayBufferLike | Blob | ArrayBufferView) => {
    if (!ws.value || ws.value.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected')
    }

    return new Promise<void>((resolve, reject) => {
      try {
        ws.value!.send(data)
        resolve()
      } catch (error) {
        reject(error)
      }
    })
  }

  const close = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
    }

    if (ws.value) {
      ws.value.close()
      ws.value = null
    }

    isConnected.value = false
    connectionStatus.value = 'DISCONNECTED'
  }

  onUnmounted(() => {
    close()
  })

  return {
    ws,
    isConnected,
    connectionStatus,
    connect,
    send,
    close,
  }
}
