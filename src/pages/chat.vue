<template>
  <div class="flex flex-col h-screen">
    <!-- 顶部状态栏 -->
    <div :class="['px-4 py-2 text-sm transition-colors flex items-center justify-between', connectionStatusClass]">
      <span>{{ connectionStatusText }}</span>
      <div v-if="isStreaming" class="flex items-center gap-2">
        <span class="text-sm">音量: {{ Math.round(volume) }}dB</span>
        <div class="w-20 h-2 bg-gray-200 dark:bg-gray-700 rounded-full">
          <div
            class="h-full bg-primary rounded-full transition-all"
            :style="{ width: `${Math.min(100, Math.max(0, (volume + 60) * 2))}%` }"
          ></div>
        </div>
      </div>
    </div>

    <!-- 聊天消息列表 -->
    <div ref="chatContainer" class="flex-1 overflow-y-auto p-4 space-y-4">
      <div
        v-for="(message, index) in messageList"
        :key="index"
        :class="['flex items-start gap-2', message.type === 'user' ? 'justify-end' : 'justify-start']"
      >
        <Avatar v-if="message.type === 'ai'" class="w-8 h-8">
          <AvatarImage src="/ai-avatar.png" />
          <AvatarFallback>AI</AvatarFallback>
        </Avatar>

        <div
          :class="[
            'max-w-[70%] rounded-lg p-3',
            message.type === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted',
          ]"
        >
          {{ message.content }}
        </div>

        <Avatar v-if="message.type === 'user'" class="w-8 h-8">
          <AvatarImage src="/user-avatar.png" />
          <AvatarFallback>Me</AvatarFallback>
        </Avatar>
      </div>

      <!-- 录音状态指示 -->
      <div v-if="isStreaming && !isSilent" class="flex justify-center">
        <span class="text-sm text-muted-foreground animate-pulse"> 正在录音... </span>
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
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Mic, MicOff, Loader2 } from 'lucide-vue-next'
import { useAudioRecorder } from '@/composables/useAudioRecorder'
import { useMockWebSocket } from '@/composables/useMockWebSocket'

// 状态管理
const isStreaming = ref(false)
const isAIResponding = ref(false)
const isLoading = ref(false)
const error = ref<string | null>(null)
const messageList = ref<Array<{ type: 'user' | 'ai'; content: string }>>([])
const chatContainer = ref<HTMLElement | null>(null)

// WebSocket 连接
const { isConnected, connect, send, close, connectionStatus, onMessage } = useMockWebSocket()

// 音频录制
const {
  isRecording,
  isSilent,
  volume,
  error: recorderError,
  startRecording,
  stopRecording,
} = useAudioRecorder({
  silenceThreshold: -50,
  silenceDuration: 2000,
  onVolumeChange: (newVolume) => {
    // 可以添加音量变化的视觉反馈
  },
  onSilenceStart: () => {
    handleSilence()
  },
  onSilenceEnd: () => {
    isSilent.value = false
  },
  onDataAvailable: (data) => {
    if (isStreaming.value && !isAIResponding.value) {
      sendAudioData(data)
    }
  },
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
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
    case 'CONNECTING':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
    case 'DISCONNECTED':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
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

// 处理静音
const handleSilence = async () => {
  if (!isStreaming.value || isAIResponding.value) return
  isSilent.value = true
}

// 发送音频数据
const sendAudioData = async (audioData: Blob) => {
  if (!isConnected.value) return

  try {
    isAIResponding.value = true

    messageList.value.push({
      type: 'user',
      content: '用户说话内容...', // 实际应用中应该是语音识别的结果
    })

    await send(audioData)
    scrollToBottom()
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
  await stopRecording()
}

// 滚动到底部
const scrollToBottom = () => {
  if (chatContainer.value) {
    setTimeout(() => {
      chatContainer.value!.scrollTop = chatContainer.value!.scrollHeight
    }, 100)
  }
}

// 处理 AI 响应
onMessage((message) => {
  if (message.type === 'ai_response' && message.content) {
    messageList.value.push({
      type: 'ai',
      content: message.content,
    })
    scrollToBottom()
  } else if (message.type === 'ai_response_end') {
    isAIResponding.value = false
    isSilent.value = false
  } else if (message.type === 'error') {
    showError(message.content || '未知错误')
  }
})

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
