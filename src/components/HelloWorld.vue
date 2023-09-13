<script setup lang="ts">
import { ref } from 'vue'
import { Edit } from './Edit'

defineProps<{ msg: string }>()

const count = ref(0)
</script>

<template>
  <h1>{{ msg }}</h1>

  <div class="card">
    <el-button type="primary" @click="count++">count is {{ count }}</el-button>
    <Edit></Edit>
  </div>
</template>

<style scoped>
.read-the-docs {
  color: #888;
}
</style>
