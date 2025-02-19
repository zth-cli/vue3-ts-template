import { ref } from 'vue'

interface AudioRecorderOptions {
  onVolumeChange?: (volume: number) => void
  silenceThreshold?: number
  silenceDuration?: number
  onSilenceStart?: () => void
  onSilenceEnd?: () => void
  onDataAvailable?: (data: Blob) => void
}

export function useAudioRecorder(options: AudioRecorderOptions = {}) {
  const {
    silenceThreshold = -50,
    silenceDuration = 2000,
    onVolumeChange,
    onSilenceStart,
    onSilenceEnd,
    onDataAvailable,
  } = options

  const isRecording = ref(false)
  const isSilent = ref(false)
  const volume = ref(0)
  const error = ref<Error | null>(null)

  let mediaRecorder: MediaRecorder | null = null
  let audioContext: AudioContext | null = null
  let analyser: AnalyserNode | null = null
  let volumeCheckInterval: number | null = null
  let silenceTimer: number | null = null

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

      // 初始化音频上下文和分析器
      audioContext = new AudioContext()
      analyser = audioContext.createAnalyser()
      analyser.fftSize = 2048

      const source = audioContext.createMediaStreamSource(stream)
      source.connect(analyser)

      // 配置录音机
      mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      })

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          onDataAvailable?.(event.data)
        }
      }

      // 开始录音
      mediaRecorder.start(100) // 每100ms触发一次ondataavailable
      startVolumeCheck()

      isRecording.value = true
      error.value = null
    } catch (err) {
      error.value = err as Error
      throw err
    }
  }

  const stopRecording = async () => {
    stopVolumeCheck()

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop()
    }

    if (audioContext) {
      await audioContext.close()
      audioContext = null
    }

    if (silenceTimer) {
      clearTimeout(silenceTimer)
    }

    analyser = null
    isRecording.value = false
    isSilent.value = false
  }

  const startVolumeCheck = () => {
    if (!analyser) return

    volumeCheckInterval = window.setInterval(() => {
      const dataArray = new Uint8Array(analyser!.frequencyBinCount)
      analyser!.getByteFrequencyData(dataArray)

      // 计算音量分贝值
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length
      const newVolume = 20 * Math.log10(average + 1)
      volume.value = newVolume

      // 触发音量变化回调
      onVolumeChange?.(newVolume)

      // 检查静音
      checkSilence(newVolume)
    }, 100)
  }

  const checkSilence = (currentVolume: number) => {
    if (currentVolume <= silenceThreshold) {
      if (!isSilent.value) {
        if (silenceTimer) clearTimeout(silenceTimer)
        silenceTimer = window.setTimeout(() => {
          isSilent.value = true
          onSilenceStart?.()
        }, silenceDuration)
      }
    } else {
      if (silenceTimer) {
        clearTimeout(silenceTimer)
        silenceTimer = null
      }
      if (isSilent.value) {
        isSilent.value = false
        onSilenceEnd?.()
      }
    }
  }

  const stopVolumeCheck = () => {
    if (volumeCheckInterval) {
      clearInterval(volumeCheckInterval)
      volumeCheckInterval = null
    }
  }

  return {
    isRecording,
    isSilent,
    volume,
    error,
    startRecording,
    stopRecording,
  }
}
