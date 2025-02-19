<template>
  <div class="flex flex-col h-screen">
    <!-- 顶部连接状态 -->
    <div :class="['px-4 py-2 text-sm transition-colors', connectionStatusClass]">
      {{ connectionStatusText }}
    </div>

    <!-- 聊天消息列表 -->
    <div ref="chatContainer" class="flex-1 overflow-y-auto p-4">
      <div
        v-for="(message, index) in messageList"
        :key="index"
        :class="['flex items-start mb-4', message.type === 'user' ? 'justify-end' : 'justify-start']"
      >
        <div
          :class="[
            'max-w-[70%] rounded-lg p-3',
            message.type === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted',
          ]"
        >
          {{ message.content }}
        </div>
      </div>
    </div>

    <!-- 错误提示 -->
    <Toast v-if="error" variant="destructive">
      <ToastTitle>发生错误</ToastTitle>
      <ToastDescription>{{ error }}</ToastDescription>
    </Toast>

    <!-- 底部控制栏 -->
    <div class="border-t p-4">
      <Button
        class="w-full h-12"
        :variant="isStreaming ? 'destructive' : 'default'"
        :disabled="!isConnected || isLoading"
        @click="toggleStreaming"
      >
        <Loader2 v-if="isLoading" class="mr-2 h-4 w-4 animate-spin" />
        <Mic v-else-if="!isStreaming" class="mr-2 h-4 w-4" />
        <MicOff v-else class="mr-2 h-4 w-4" />
        {{ buttonText }}
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Button } from '@/components/ui/button'
import { Toast, ToastTitle, ToastDescription } from '@/components/ui/toast'
import { Mic, MicOff, Loader2 } from 'lucide-vue-next'
import { useWebSocket } from '@/composables/useWebSocket'
import { useRecorder } from '@/composables/useAudioRecorderorder'
declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext
  }
}

// 状态管理
const isStreaming = ref(false)
const isSilent = ref(false)
const isAIResponding = ref(false)
const isLoading = ref(false)
const error = ref<string | null>(null)
const messageList = ref<Array<{ type: 'user' | 'ai'; content: string }>>([])

// WebSocket 连接状态
const { isConnected, connect, send, close, connectionStatus } = useWebSocket('wss://你的服务器地址', {
  onMessage: handleWebSocketMessage,
  onError: handleWebSocketError,
  autoReconnect: true,
  reconnectAttempts: 5,
  reconnectInterval: 3000,
})

// 录音相关
const {
  startRecording,
  stopRecording,
  isRecording,
  audioBuffer,
  volume,
  error: recorderError,
} = useRecorder({
  onVolumeChange: handleVolumeChange,
  silenceThreshold: -50,
  silenceDuration: 2000,
})

// 计算属性
const buttonText = computed(() => {
  if (isLoading.value) return '连接中...'
  if (!isConnected.value) return '未连接'
  if (!isStreaming.value) return '开始对话'
  if (isSilent.value) return '静音中...'
  return '收听中...'
})

const connectionStatusClass = computed(() => {
  switch (connectionStatus.value) {
    case 'CONNECTED':
      return 'bg-green-100 text-green-800'
    case 'CONNECTING':
      return 'bg-yellow-100 text-yellow-800'
    case 'DISCONNECTED':
      return 'bg-red-100 text-red-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
})

const connectionStatusText = computed(() => {
  switch (connectionStatus.value) {
    case 'CONNECTED':
      return '已连接'
    case 'CONNECTING':
      return '连接中...'
    case 'DISCONNECTED':
      return '未连接'
    default:
      return '连接状态未知'
  }
})

// 错误处理
const showError = (message: string) => {
  error.value = message
  setTimeout(() => {
    error.value = null
  }, 5000)
}

function handleWebSocketError(_event: Event) {
  showError('WebSocket 连接错误，正在尝试重新连接...')
}

function handleRecorderError(error: Error) {
  showError(`录音错误: ${error.message}`)
  stopStreaming()
}

// 音量处理
const handleVolumeChange = (newVolume: number) => {
  if (newVolume > -50 && isStreaming.value && !isAIResponding.value) {
    isSilent.value = false
    resetSilenceTimer()
  }
}

// 静音处理
let silenceTimer: number | null = null

const resetSilenceTimer = () => {
  if (silenceTimer) {
    clearTimeout(silenceTimer)
  }
  silenceTimer = window.setTimeout(handleSilence, 2000)
}

const handleSilence = () => {
  if (!isStreaming.value || isAIResponding.value) return

  isSilent.value = true
  if (audioBuffer.value.length > 0) {
    sendAudioData()
  }
}

// WebSocket 消息处理
async function handleWebSocketMessage(event: MessageEvent) {
  try {
    const response = JSON.parse(event.data) as {
      type: 'ai_response_end' | 'error'
      message?: string
      audio?: ArrayBuffer
    }

    if (response.type === 'ai_response_end') {
      isAIResponding.value = false
      await startRecording()
    } else if (response.type === 'error' && response.message) {
      showError(response.message)
    } else if (response.audio) {
      // 处理音频响应
      const audioContext = new (window.AudioContext || window.webkitAudioContext)()
      const audioBuffer = await audioContext.decodeAudioData(response.audio)
      const source = audioContext.createBufferSource()
      source.buffer = audioBuffer
      source.connect(audioContext.destination)
      source.start()
    }
  } catch (error) {
    showError('处理服务器响应时出错')
  }
}

// 发送音频数据
const sendAudioData = async () => {
  if (!isConnected.value || !audioBuffer.value.length) return

  try {
    isAIResponding.value = true
    const blob = new Blob(audioBuffer.value, { type: 'audio/webm' })
    await send(blob)
    audioBuffer.value = []
  } catch (error) {
    showError('发送音频数据失败')
    isAIResponding.value = false
  }
}

// 控制流程
const toggleStreaming = async () => {
  if (isStreaming.value) {
    await stopStreaming()
  } else {
    await startStreaming()
  }
}

const startStreaming = async () => {
  try {
    isLoading.value = true

    if (!isConnected.value) {
      await connect()
    }

    await startRecording()
    isStreaming.value = true
  } catch (error) {
    showError('启动录音失败')
  } finally {
    isLoading.value = false
  }
}

const stopStreaming = async () => {
  isStreaming.value = false
  isAIResponding.value = false
  isSilent.value = false

  if (silenceTimer) {
    clearTimeout(silenceTimer)
  }

  await stopRecording()
}

// 生命周期钩子
onMounted(async () => {
  try {
    isLoading.value = true
    await connect()
  } catch (error) {
    showError('初始化连接失败')
  } finally {
    isLoading.value = false
  }
})

onUnmounted(() => {
  stopStreaming()
  close()
})
</script>
